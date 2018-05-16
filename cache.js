"use strict";

const Redis = require("redis");
const PubSub = require('google-pubsub-wrapper');

const sep = '__';
const group = 'cache';

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
        function callAgain(instance, mName, k, v, c)
        {
            return new Promise(function (resolve, reject)
            {
                setTimeout(function ()
                {
                    instance.findObjs(mName, k, v, c + 1).then(resolve).catch(reject);
                }, 500);
            });
        }

        function askForPriming(instance, mName)
        {
            return instance.pubsub.emit([
            {
                modelName: mName
            }],
            {
                topicName: group + sep + mName,
                groupName: group,
                env: instance.env
            });
        }

        return new Promise(function (resolve, reject)
        {
            self.cache.get(modelName, function (err, res)
            {
                if (err) reject(err);
                else resolve(res);
            });
        }).then(function (res)
        {
            if (res && res.length > 0) return JSON.parse(res);

            // Limit checking to a max of 20 times (10 seconds)
            if (check > 20) return [];
            if (check > 0) return callAgain(self, modelName, key, value, check);

            return askForPriming(self, modelName).then(function ()
            {
                return callAgain(self, modelName, key, value, 0);
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
            if (err && err.message) console.error(err.message);
        });
    }

    // If models are passed, we must watch and subscribe to them
    if (options.models) options.models.forEach(function (modelName)
    {
        if (!options.app) throw new Error('options.app is required');

        const Model = options.app.models[modelName];
        if (!modelName || !Model) return;

        self.pubsub.subscribe(
        {
            topicName: group + sep + modelName,
            groupName: group,
            env: self.env,
            callback: pubsubCallback(self.cache, options.app)
        });

        Model.observe('after save', loopbackHook(self.cache, options.app));
        Model.observe('after delete', loopbackHook(self.cache, options.app));
    });

    return self;
}

//Returns a function that resets key value data in cache based on modelName passed
function pubsubCallback(cache, app)
{
    return function (d)
    {
        if (!cache) throw new Error('pubsub callback missing cache');
        if (!app) throw new Error('pubsub callback missing app');
        if (!d) throw new Error('pubsub callback missing data');

        if (!d.modelName) throw new Error('pubsub callback missing d.modelName');
        return findAndSetOrDel(cache, app, d.modelName);
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

function findAndSetOrDel(cache, app, modelName)
{
    return app.models[modelName].find().then(data =>
    {
        return new Promise(function (resolve, reject)
        {
            if (!data || data.length < 1)
            {
                cache.del(modelName, function (err, res)
                {
                    if (err) reject(err);
                    else resolve(res);
                });
            }
            else cache.set(modelName, JSON.stringify(data), function (err, res)
            {
                if (err) reject(err);
                else resolve(res);
            });
        });

    }).catch(function (err)
    {
        if (err && err.message) console.error(err.message);
    });
}