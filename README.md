# loopback-rediscache-models
Caching system for Loopback through redis - maintains data in redis for all data of specified models

### Usage client side

In a boot script
```
var cache = require('loopback-rediscache-models')(
{
    app: app,
    models: ['Customer']
});
```


Then in the models you want to use cache
```
var cache = require('loopback-rediscache-models')();
cache.findObj('Customer', 'id', 1).then(function (customer)
{
    console.log(customer);
});
```