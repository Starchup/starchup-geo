/**
 * Modules from the community: package.json
 */
var GEO = require('./main');
var expect = require('chai').expect;

var conf = {
    api_id: "vjLeJo1MxYQhiIjboKxW",
    api_key: "YVTR2yF_xpwH-X2KV6fILw"
};
var geo = new GEO(conf);

describe('geo.calculate', function ()
{
    var origin = {
        lat: 41.2800,
        lng: -96.0042,
        id: 'business'
    };
    var destination = {
        lat: 41.2939,
        lng: -96.0206,
        id: 'my home'
    };
    var waypoint1 = {
        lat: 41.2852,
        lng: -96.0110,
        id: 'my friend'
    };

    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    it('should get expected times in a route, in the future', function (done)
    {
        geo.calculate([origin, waypoint1, destination], tomorrow).then(function (res)
        {
            expect(res).to.be.an('object');
            expect(res.travelTime).to.be.greaterThan(0);
            expect(res.distance).to.be.greaterThan(0);
            expect(res.startTime).to.equal(tomorrow.getTime() / 1000);
            expect(res.legs).to.be.an('array');
            expect(res.legs.length).to.equal(2);
            expect(res.legs[0]).to.be.an('object');
            expect(res.legs[0].start).to.be.an('object');
            expect(res.legs[0].end).to.be.an('object');
            expect(res.legs[0].distance).to.be.greaterThan(0);
            expect(res.legs[0].travelTime).to.be.greaterThan(0);
            expect(res.legs[0].start.key).to.equal('business');
            expect(res.legs[0].start.latitude).to.be.an('number');
            expect(res.legs[0].start.longitude).to.be.an('number');
            expect(res.legs[0].end.key).to.equal('my friend');
            expect(res.legs[0].end.latitude).to.be.an('number');
            expect(res.legs[0].end.longitude).to.be.an('number');

            expect(res.legs[1]).to.be.an('object');
            expect(res.legs[1].start).to.be.an('object');
            expect(res.legs[1].end).to.be.an('object');
            expect(res.legs[1].distance).to.be.greaterThan(0);
            expect(res.legs[1].travelTime).to.be.greaterThan(0);
            expect(res.legs[1].start.key).to.equal('my friend');
            expect(res.legs[1].start.latitude).to.be.an('number');
            expect(res.legs[1].start.longitude).to.be.an('number');
            expect(res.legs[1].end.key).to.equal('my home');
            expect(res.legs[1].end.latitude).to.be.an('number');
            expect(res.legs[1].end.longitude).to.be.an('number');

            done();
        }).catch(done);
    });
});

describe('geo.findClosestToOrigin and geo.findFarthestFromOrigin', function ()
{
    var origin1 = {
        lat: 41.2800,
        lng: -96.0042,
        id: 'business'
    };
    var closest = {
        lat: 41.2939,
        lng: -96.0206,
        id: 'my home'
    };
    var farthest = {
        lat: 41.2799,
        lng: -96.0164,
        id: 'my friend'
    };

    it('should get the closest destiation to points', function (done)
    {
        geo.findClosestToOrigin(origin1, [closest, farthest]).then(function (res)
        {
            expect(res.id).to.equal(closest.id);

            done();
        }).catch(done);
    });

    it('should get the farthest destiation to points', function (done)
    {
        geo.findFarthestFromOrigin(origin1, [closest, farthest]).then(function (res)
        {
            expect(res.id).to.equal(farthest.id);

            done();
        }).catch(done);
    });
});

describe('geo.geocode', function ()
{
    var address = {
        "street": "4629 N Broadway St",
        "city": "Chicago",
        "unit": "1W",
        "state": "IL",
        "zip": "60640",
        "country": "USA"
    };

    var location = {
        latitude: 41.96628,
        longitude: -87.6577
    };

    it('should geocode address', function (done)
    {
        geo.geocode(address).then(function (res)
        {
            expect(res).to.be.an('object');
            expect(res.latitude).to.equal(res.latitude);
            expect(res.longitude).to.equal(res.longitude);

            done();
        }).catch(done);
    });
});

describe('geo.optimize', function ()
{
    var origin = {
        lat: 41.2800,
        lng: -96.0042,
        key: 'business'
    };
    var destination = {
        lat: 41.2939,
        lng: -96.0206,
        key: 'my-home'
    };
    var waypoint1 = {
        lat: 41.2800,
        lng: -96.0050,
        key: 'shop'
    };
    var waypoint2 = {
        lat: 41.2799,
        lng: -96.0164,
        key: 'my-friend'
    };

    it('should get the closest destiation to points', function (done)
    {
        var departure = Date.now();
        var manualRoute = false;

        geo.optimize(origin, destination, [waypoint1, waypoint2], departure, manualRoute).then(function (res)
        {
            expect(res).to.be.an('object');
            expect(res.time).to.be.greaterThan(1);
            expect(res.distance).to.be.greaterThan(1);
            expect(res.startTime).to.be.greaterThan(1);

            expect(res.waypoints).to.be.an('array');
            expect(res.waypoints.length).to.equal(4);
            res.waypoints.forEach(function (r)
            {
                expect(r).to.be.an('object');
                expect(r.key).to.be.an('string');
                expect(r.latitude).to.be.a('number');
                expect(r.longitude).to.be.a('number');
                expect(r.sequence).to.be.a('number');
            });

            done();
        }).catch(done);
    });
});