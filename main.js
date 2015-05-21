var zipp = require('node-zippopotamus');
var GoogleMapsAPI = require('googlemaps');

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
    var location = String(location.lat) + "," + String(location.lng);
    var params = {
        "latlng":        location,
        "result_type":   "postal_code",
        "language":      "en",
        "location_type": "APPROXIMATE"
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
}

/**
 * Geocode an address to coordinates
 *
 * param {zipcode} the zipcode to match
 *
 * return coordinates
 */
exports.geocode = function(address, cb)
{
    var params = {
        "address":    address,
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
            return cb(error, result);
        }
        
        if (result.status != "OK" || result.results.length < 1)
        {
            var error = new Error('Could not create address with Google Maps');
            error.code = '490';
            return cb(error, result);
        }
        cb(err, result.results[0].geometry.location);
    });
};

/**
 * Get the time to travel between 2 provided locations
 *
 * param {origin} the origin address, without country
 * param {destination} the destination address, without country
 *
 * return time in seconds
 */
exports.travel_time = function(origin, destination, cb)
{
    var params = {
        origin: origin + ', USA',
        destination: destination + ', USA'
    };
    gm.directions(params, function(err, result)
    {
        if (err) return cb(err);

        if (result.status == "OVER_QUERY_LIMIT")
        {
            var error = new Error('Reached Google Maps API limit');
            error.code = '490';
            return cb(error, result);
        }
        
        if (result.status != "OK" ||
            !result.routes || result.routes.length < 1 ||
            !result.routes[0].legs || result.routes[0].legs.length < 1)
        {   
            var error = new Error('Could not create address with Google Maps');
            error.code = '490';
            return cb(error, result);
        }
        cb(err, result.routes[0].legs[0].duration.value);
    });
};