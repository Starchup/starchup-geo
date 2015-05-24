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
    zipp('us', zipcode, function (err, json)
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
 * Get the zipcode matched to a provided geolocation
 *
 * param {location} the geolocation to match
 *
 * return zipcode
 */
exports.zipForLocation = function(location, cb)
{
    var loc = location;
    limiter.removeTokens(1, function(err, remainingRequests)
    {
        var location = String(loc.lat) + "," + String(loc.lng);
        var params = {
            latlng:        location,
            result_type:   "postal_code",
            language:      "en",
            location_type: "APPROXIMATE",
            region: "us"
        };
        gm.reverseGeocode(params, function(err, result)
        {
            if (err) return cb(err);

            var zip;
            result.results[0].address_components.forEach(function(component)
            {
                if ('types' in component && component.types[0] === 'postal_code') 
                {
                    zip = component.long_name;
                } 
            });
            
            cb(err, zip);
        });
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
 * Get the time to travel between 2 provided locations
 *
 * param {identifier} an identifier provided to return with the time
 * param {origin} the origin address, without country
 * param {destination} the destination address, without country
 *
 * return {identifier: time} in seconds
 */
exports.travel_time = function(identifier, origin, destination, cb)
{
    var id = identifier;
    var orig = origin;
    var dest = destination;
    limiter.removeTokens(1, function(err, remainingRequests)
    {
        var params = {
            origin: orig + ', USA',
            destination: dest + ', USA',
            region: "us"
        };
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
                var error = new Error('Could not create address with Google Maps');
                error.code = '490';
                return cb(error, identifier);
            }

            // Get the total duration
            var duration = 0;
            result.routes[0].legs.forEach(function(leg)
            {
                duration+=leg.duration.value;
            });

            // Return the duration
            var returnObj = {};
            returnObj[id] = duration;
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
        if (waypoints) params.waypoints = waypoints;
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
