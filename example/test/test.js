var app = require('../server.js');
var expect = require('chai').expect;

describe('Test cache emitting', function ()
{
    var cache = require('../../cache.js')();

    var customerData = {
        id: 1,
        name: 'Tom Cruise'
    }
    var orderData = {
        customerId: 1
    }

    before(function (done)
    {
        app.models.Customer.create(customerData).then(function ()
        {
            done();
        }).catch(done);
    });

    it('should find the customer cached', function (done)
    {
        cache.findObj('Customer', 'id', customerData.id).then(function (customer)
        {
            expect(customer).to.exist;
            expect(customer.name).to.equal(customerData.name);

            done();
        }).catch(done);
    });

    it('should find the customer name on the order', function (done)
    {
        app.models.Order.create(orderData).then(function (order)
        {
            expect(order).to.exist;
            expect(order.customerName).to.equal(customerData.name);

            done();

        }).catch(done);
    });
});