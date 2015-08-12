var zipp = require('node-zippopotamus');
var GoogleMapsAPI = require('googlemaps');

var RateLimiter = require('limiter').RateLimiter;
var limiter = new RateLimiter(1, 100);

var gm = new GoogleMapsAPI({ key: process.env.GOOGLE_GEO_KEY });

/**
 * Get the city matched to a provided zipcode
 *
 * param {zipcode} the zipcode to match
 *
 * return city
 */
exports.cityForZip = function(zipcode, cb)
{
    var country = 'us';

    // Add support for canada
    if (zipcode.match(/[a-z]/i)) country = 'ca';
    if (zipcode.match(/[a-z]/i)) zipcode.slice(0,3);

    zipp(country, zipcode, function (err, json)
    {
        if (err) return cb(err);

        if (json.places.length < 1)
        {
            var error = new Error('Could not get valid city for address');
            error.code = '400';
            return cb(error);
        }
        try {
            cb(err, json.places[0]["place name"]);
        }
        catch (ex) {
            cb(ex);
        }
    });
}

/**
 * Geocode an address to coordinates
 *
 * param {identifier} an identifier provided to return with the location
 * param {zipcode} the zipcode to match
 *
 * return {identifier: coordinates}
 */
exports.geocode = function(identifier, address, cb)
{
    var id = identifier;
    var add = address;
    limiter.removeTokens(1, function(err, remainingRequests)
    {
        var params = {
            "address":    add,
            "components": "components=country:US",
            "language":   "en",
            "region":     "us"
        };
        gm.geocode(params, function(err, result)
        {
            if (err) return cb(err);

            if (result.status == "OVER_QUERY_LIMIT")
            {
                var error = new Error('Reached Google Maps API limit');
                error.code = '490';
                return cb(error, identifier);
            }
            
            if (result.status != "OK" || result.results.length < 1)
            {
                var error = new Error('Could not create address with Google Maps');
                error.code = '490';
                return cb(error, identifier);
            }

            var returnObj = {};
            returnObj[id] = result.results[0].geometry.location;
            cb(err, returnObj);
        });
    });
};

/**
 * Get the directions to travel between origin and destionation,
 * optionally providing a set of waypoints.
 *
 * param {identifier} an identifier provided to return with the time
 * param {origin} the destination address, without country
 * param {destination} the destination address, without country
 * param {waypoints} an array of address, without country
 * param {date} departure time, as a unix timestamp
 *
 * return {identifier: directions}
 */
exports.directions = function(identifier, origin, destination, waypoints, date, cb)
{
    var id = identifier;
    var orig = origin;
    var dest = destination;

    if (!orig || !destination)
    {
        var error = new Error('No origin or destination provided');
        error.code = '490';
        return cb(error, identifier);
    }

    limiter.removeTokens(1, function(err, remainingRequests)
    {
        var params = {
            origin: orig + ', USA',
            destination: dest + ', USA',
            region: "us"
        };
        if (waypoints)
        {
            var locations = "optimize:true";
            waypoints.forEach(function(waypoint)
            {
                locations = locations + "|" + waypoint;
            });
            params.waypoints = locations;
        }
        
        if (date) params.departureTime = date;

        gm.directions(params, function(err, result)
        {
            if (err) return cb(err);

            if (result.status == "OVER_QUERY_LIMIT")
            {
                var error = new Error('Reached Google Maps API limit');
                error.code = '490';
                return cb(error, identifier);
            }
            
            if (result.status != "OK" ||
                !result.routes || result.routes.length < 1 ||
                !result.routes[0].legs || result.routes[0].legs.length < 1)
            {   
                var error = new Error('Could not get directions with Google Maps');
                error.code = '490';
                return cb(error, identifier);
            }

            var returnObj = {};
            returnObj[id] = result.routes[0];
            cb(err, returnObj);
        });
    });
};