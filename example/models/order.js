var Cache = require('../../cache.js');

module.exports = function (Order)
{
    // Before an order is about to be saved, add it's customer's name to it
    // pretty useless.. but you get to see how cache-machine works!
    Order.observe('before save', function (ctx, next)
    {
        var cache = Cache();

        var order = null;
        if (ctx.data) order = ctx.data;
        else if (ctx.instance) order = ctx.instance;
        else return next();

        cache.findObj('Customer', 'id', order.customerId).then(function (customer)
        {
            if (!customer) throw new Error('CustomerId is not valid: ' + JSON.stringify(order));
            order.customerName = customer.name;

            next();
        }).catch(next);
    });
};