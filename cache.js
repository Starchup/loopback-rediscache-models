"use strict";

const redis = require("redis");

const sep = '__';

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

    self.cache = redis.createClient(
    {
        host: options.host,
        port: options.port
    });

    self.cache.on("error", function (err)
    {
        if (err && err.message) console.error(err.message);
    });

    self.findObj = function (modelName, key, value)
    {
        return self.findObjs(modelName, key, value).then(function (res)
        {
            return res && res.length > 0 ? res[0] : res;
        });
    }

    self.findObjs = function (modelName, key, value)
    {
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
            if (!self.unPrimed) return res;

            return self.unPrimed(modelName).then(function ()
            {
                return self.findObjs(modelName, key, value);
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

    self.primeData = function (modelName, data)
    {
        return new Promise(function (resolve, reject)
        {
            self.cache.set(modelName, JSON.stringify(data), function (err, res)
            {
                if (err) reject(err);
                else resolve(res);
            });
        });
    }

    if (options)
    {
        if (options.unPrimed)
        {
            if (getType(options.unPrimed) !== 'Function') throw new Error('options.unPrimed must be a function');
            self.unPrimed = options.unPrimed;
        }

        if (options.models) options.models.forEach(function (modelName)
        {
            const Model = options.app.models[modelName];
            if (!modelName || !Model) return;

            Model.observe('after save', loopbackHook(self.cache, options.app));
            Model.observe('before delete', loopbackHook(self.cache, options.app));
        });
    }

    return self;
}


//Returns a function that watches model crection changes and publishes them
function loopbackHook(cache, app)
{
    return function (ctx, next)
    {
        const modelName = getModelName(ctx);
        if (!modelName) return next();

        app.models[modelName].find().then(models =>
        {
            return new Promise(function (resolve, reject)
            {
                if (!models || models.length < 1)
                {
                    cache.del(modelName, function (err, res)
                    {
                        if (err) reject(err);
                        else resolve(res);
                    });
                }
                else cache.set(modelName, JSON.stringify(models), function (err, res)
                {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
        }).catch(function (err)
        {
            if (err && err.message) console.error(err.message);
        }).then(function ()
        {
            next();
        });
    }
}

/* General helpers */

function getModelName(ctx)
{
    return ctx.Model && ctx.Model.definition && ctx.Model.definition.name;
}

function getType(val)
{
    return Object.prototype.toString.call(val).slice(8, -1);
}