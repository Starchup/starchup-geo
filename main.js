var zipp = require('node-zippopotamus');
var gm = require('googlemaps');

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

exports.zipForLocation = function(location, cb)
{
    var location = String(location.lat) + "," + String(location.lng);
    gm.reverseGeocode(location, function(err, result)
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

exports.geocode = function(address, cb)
{
    gm.geocode(address + ', USA', function(err, result)
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

exports.travel_time = function(origin, destination, cb)
{
    gm.directions(origin + ', USA', destination + ', USA', function(err, result)
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