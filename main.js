var zipp = require('node-zippopotamus');
var GoogleMapsAPI = require('googlemaps');

var RateLimiter = require('limiter').RateLimiter;
var limiter = new RateLimiter(1, 100);

var gm = new GoogleMapsAPI({
    key: process.env.GOOGLE_GEO_KEY
});

/**
 * Utility to support various countries
 */
var zipcodeFormats = {
    'us': "^[a-zA-Z0-9]{5}",
    'za': "^[a-zA-Z0-9]{4}",
    'ca': "^[a-zA-Z0-9]{3}( )[a-zA-Z0-9]{3}"
};

var supportedCountry = function(zipcode) {
    if (!zipcode) return null;

    for (var countryCode in zipcodeFormats) {
        if (!zipcodeFormats.hasOwnProperty(countryCode)) continue;

        var zipcodeExp = zipcodeFormats[countryCode];
        if (zipcode.match(zipcodeExp)) return countryCode;
    }
    return null;
}
exports.SUPPORTED_COUNTRY = supportedCountry;

/**
 * Get the city matched to a provided zipcode
 *
 * param {zipcode} the zipcode to match
 *
 * return city
 */
exports.cityForZip = function(zipcode, cb) {
    if (!zipcode) return null;

    var country = supportedCountry(zipcode);
    if (!country || country.length < 1) {
        var error = new Error('Zipcode format invalid or country not supported');
        error.code = '400';
        return cb(error);
    }

    if (country == 'ca') zipcode = zipcode.slice(0, 3);

    zipp(country, zipcode, function(err, json) {
        if (err) return cb(err);
        if (json.places.length < 1) {
            err = new Error('Could not get valid city for address');
            err.code = '400';
            return cb(err);
        }
        try {
            cb(err, json.places[0]["place name"]);
        } catch (ex) {
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
exports.geocode = function(identifier, address, cb) {
    var components = address.split(' ');
    var zipcode = components[components.length - 1];
    var country = supportedCountry(zipcode);
    if (!country || country.length < 1) {
        var error = new Error('Country not supported for geocoding');
        error.code = '400';
        return cb(error);
    }

    var id = identifier;
    var add = address;
    limiter.removeTokens(1, function(err, remainingRequests) {
        var params = {
            "address": add,
            "components": "components=country:" + country,
            "language": "en",
            "region": country
        };
        gm.geocode(params, function(err, result) {
            if (err) return cb(err);

            if (result.status == "OVER_QUERY_LIMIT") {
                var error = new Error('Reached Google Maps API limit');
                error.code = '490';
                return cb(error, identifier);
            }

            if (result.status != "OK" || result.results.length < 1) {
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
 * param {origin} either an address string, an order object with address field, or a latitude/longitude object
 * param {destination} the destination address, without country
 * param {waypoints} an array of address, without country
 * param {date} departure time, as a unix timestamp
 *
 * return {identifier: directions}
 */
exports.directions = function(identifier, origin, destination, waypoints, date, cb) {
    var id = identifier;
    var orig;
    var dest = destination;

    if (!origin || !destination) {
        var error = new Error('No origin or destination provided');
        error.code = '490';
        return cb(error, identifier);
    }

    //Temporary protection for backwards compatibility - lots of places calling with origin as an address string
    if (typeof origin !== 'string') {

        //Origin is order object w/ customer_address object
        if (origin.customer_address) {
            address = origin.customer_address;
            var zipcode = address.zip;
            var country = supportedCountry(zipcode);
            if (!country || country.length < 1) {
                var error = new Error('Country not supported for directions');
                error.code = '400';
                return cb(error);
            }
            //stringify customer address
            var addressStr = address.street;
            if (address.unit) addressStr = addressStr + ' ' + address.unit;
            addressStr = addressStr + ', ' + address.city;
            if (address.state) addressStr = addressStr + ' ' + address.state;
            addressStr = addressStr + ' ' + address.zip;
            addressStr = addressStr + ', ' + country;
            orig = addressStr;

            //Origin is lat/lng object
        } else if (origin.lat && origin.lng) {
            orig = origin.lat + ',' + origin.lng;
        } else {
            var error = new Error('Provided origin is not valid');
            error.code = '490';
            return cb(error, identifier);
        }
        //Origin is an address string
    } else {
        var components = origin.split(' ');
        var zipcode = components[components.length - 1];
        var country = supportedCountry(zipcode);
        if (!country || country.length < 1) {
            var error = new Error('Country not supported for directions');
            error.code = '400';
            return cb(error);
        }
        orig = origin + ', ' + country;
    }


    limiter.removeTokens(1, function(err, remainingRequests) {
        var params = {
            origin: orig,
            destination: dest + ', ' + country,
            region: country
        };
        if (waypoints) {
            var locations = "optimize:true";
            waypoints.forEach(function(waypoint) {
                locations = locations + "|" + waypoint;
            });
            params.waypoints = locations;
        }

        if (date) params.departureTime = date;

        gm.directions(params, function(err, result) {
            if (err) return cb(err);

            if (result.status == "OVER_QUERY_LIMIT") {
                var error = new Error('Reached Google Maps API limit');
                error.code = '490';
                return cb(error, identifier);
            }

            if (result.status != "OK" ||
                !result.routes || result.routes.length < 1 ||
                !result.routes[0].legs || result.routes[0].legs.length < 1) {
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

//Calls Google Maps Distance Matrix API
exports.distanceMatrix = function(origins, destinations, cb) {
    var error;

    if (!origins.length || !destinations.length) {
        error = new Error('No origins or destinations provided');
        error.code = '490';
        return Promise.reject(error);
    }

    return new Promise(function(resolve, reject) {
        limiter.removeTokens(1, function(err, remainingRequests) {
            var params = {
                origins: origins,
                destinations: destinations,
            };

            gm.distance(params, function(err, result) {
                if (err) reject(err);

                if (result.status == "OVER_QUERY_LIMIT") {
                    error = new Error('Reached Google Maps API limit');
                    error.code = '490';
                    reject(error);
                }

                if (result.status != "OK" ||
                    !result.rows || result.rows.length < 1 ||
                    !result.rows[0].elements || result.rows[0].elements.length < 1) {
                    error = new Error('Could not get directions with Google Maps');
                    error.code = '490';
                    reject(error);
                }

                resolve(result);
            });
        });
    });
};
