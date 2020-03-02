"use strict";

const Redis = require("redis");
const PubSub = require('google-pubsub-wrapper');

const sep = '__';
const group = 'cache';

const maxRetries = 10;
const waitBetweenPrimeAsks = 1000;
const waitAfterCacheFailure = 1000;

let cacheInstance;

module.exports = function (options)
{
    if (!cacheInstance && options) cacheInstance = Cache.call(
    {}, options);
    return cacheInstance;
}


/**
 * Creates the cache machine
 * 
 * @param {object} app - Loopback app object.
 * @param {object} options - Configuration options.
 * @param {string} options.host - Host for redis storage.
 * @param {string} options.port - Port for redis storage.
 * @param {object[]} [options.models] - Models to watch and cache.  Used when options.type is client.
 */
function Cache(options)
{
    const self = this;

    self.findObj = function (modelName, key, value)
    {
        return self.findObjs(modelName, key, value).then(function (res)
        {
            return res && res.length > 0 ? res[0] : res;
        });
    }

    self.findObjs = function (modelName, key, value, check)
    {
        var instance = self;

        return new Promise(function (resolve, reject)
        {
            try
            {
                instance.cache.get(modelName, function (err, res)
                {
                    if (err) reject(err);
                    else resolve(res);
                });
            }
            catch (err)
            {
                reject(err);
            }
        }).then(function (res)
        {
            if (res && res.length > 0) return JSON.parse(res);

            // Limit checking to a max of 10 times (10 seconds)
            if (check >= maxRetries) return [];
            if (check > 0) return wait(waitBetweenPrimeAsks).then(function ()
            {
                instance.findObjs(modelName, key, value, check + 1);
            });

            return instance.pubsub.emit(
            {
                modelName: modelName
            },
            {
                topicName: group + sep + modelName,
                groupName: group,
                env: instance.env
            }).then(function ()
            {
                return wait(waitBetweenPrimeAsks).then(function ()
                {
                    return instance.findObjs(modelName, key, value, 1);
                });
            });
        }).then(function (res)
        {
            if (!res || res.length < 1) return [];

            return res.filter(obj =>
            {
                return obj[key] === value;
            })
        });
    }

    // If no options are passed, just exit
    if (!options) return self;


    // If options are passed, run through setup
    if (!options.env) throw new Error('options.env is required');
    if (!self.env) self.env = options.env;

    if (!options.pubsubProjectId) throw new Error('options.pubsubProjectId is required');
    if (!self.pubsub) self.pubsub = PubSub.init(options.pubsubProjectId);

    if (!self.cache)
    {
        self.cache = Redis.createClient(
        {
            host: options.host,
            port: options.port
        });

        self.cache.on("error", function (err)
        {
            if (err && err.message) console.error('loopback-rediscache-models: cache on error ' + err.message);
        });
    }

    // If models are passed, we must watch and subscribe to them
    if (options.models) options.models.forEach(function (modelName)
    {
        if (!options.app) throw new Error('options.app is required');

        const Model = options.app.models[modelName];
        if (!modelName || !Model) return;

        const topicName = group + sep + modelName;

        self.pubsub.subscribe(
        {
            topicName: topicName,
            groupName: group,
            env: self.env,
            callback: pubsubCallback(self.cache, options.app, topicName)
        });

        self.findObjs(modelName);

        Model.observe('after save', loopbackHook(self.cache, options.app));
        Model.observe('after delete', loopbackHook(self.cache, options.app));
    });

    return self;
}

//Returns a function that resets key value data in cache based on modelName passed
function pubsubCallback(cache, app, topic)
{
    return function (d)
    {
        if (!cache) console.error(new Error('pubsub callback for ' + topic + ' missing cache'));
        else if (!app) console.error(new Error('pubsub callback for ' + topic + ' missing app'));
        else if (!d) console.error(new Error('pubsub callback for ' + topic + ' missing data'));
        else if (!d.modelName) console.error(new Error('pubsub callback missing d.modelName'));
        else return findAndSetOrDel(cache, app, d.modelName);
    }
}

//Returns a function that resets key value data in cache based on model data updated or created
function loopbackHook(cache, app)
{
    return function (ctx, next)
    {
        if (!ctx.Model || !ctx.Model.definition || !ctx.Model.definition.name) next();
        else findAndSetOrDel(cache, app, ctx.Model.definition.name).then(function ()
        {
            next();
        });
    }
}

function findAndSetOrDel(cache, app, modelName, retry)
{
    return app.models[modelName].find().then(data =>
    {
        return new Promise(function (resolve, reject)
        {
            try
            {
                cache.set(modelName, JSON.stringify(data), function (err, res)
                {
                    if (err) reject(err);
                    else resolve(res);
                });
            }
            catch (err)
            {
                reject(err);
            }
        });
    }).catch(function (err)
    {
        if (retry) throw err;

        else return wait(waitAfterCacheFailure).then(function ()
        {
            return findAndSetOrDel(cache, app, modelName, true);
        });
    });
}

function wait(delay)
{
    return new Promise(function (resolve, reject)
    {
        setTimeout(function ()
        {
            resolve();
        }, delay);
    });
}