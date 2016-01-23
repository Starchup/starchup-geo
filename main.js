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
    var errorCount = 0;
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
        gm.geocode(params, processGeocode);

        function processGeocode(err, result) {
            if (err) {
                if (isDev()) console.log(err);
                errorCount++;

                if (errorCount > 1) return cb(err);
                else gm.geocode(params, processGeocode);
            }

            if (result.status == "OVER_QUERY_LIMIT") {
                var error = new Error('Reached Google Maps API limit');
                error.code = '490';
                return cb(error, identifier);
            }

            if (result.status != "OK" || result.results.length < 1) {
                if (isDev()) {
                    console.log('\nStatus: ' + result.status);
                    console.log('\nResult: ');
                    console.log(result.results);
                }

                var error = new Error('Could not create address with Google Maps');
                error.code = '490';
                return cb(error, identifier);
            }

            var returnObj = {};
            returnObj[id] = result.results[0].geometry.location;
            cb(err, returnObj);
        }
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
    var error;
    var errorCount = 0;
    var dest = destination;

    if (!origin || !destination) {
        error = new Error('No origin or destination provided');
        error.code = '490';
        return Promise.reject(error);
    }

    orig = formatLocation(origin);
    dest = formatLocation(destination);

    //If error, reject
    if (orig instanceof Error) return Promise.reject(orig);
    if (dest instanceof Error) return Promise.reject(dest);

    return new Promise(function(resolve, reject) {
        limiter.removeTokens(1, function(err, remainingRequests) {
            var params = {
                origin: orig.string,
                destination: dest.string,
                region: orig.country
            };

            if (waypoints) {
                var locations = "optimize:true";
                waypoints.forEach(function(waypoint) {
                    locations = locations + "|" + waypoint;
                });
                params.waypoints = locations;
            }

            if (date) params.departureTime = date;

            gm.directions(params, processDirections);

            function processDirections(err, result) {
                if (err) {
                    if (isDev()) console.log(err);
                    errorCount++;

                    //If there an error, try again, but only twice
                    if (errorCount > 1) reject(err);
                    else gm.directions(params, processDirections);
                }

                if (result.status == "OVER_QUERY_LIMIT") {
                    error = new Error('Reached Google Maps API limit');
                    error.code = '490';
                    reject(error);
                }

                if (result.status != "OK" ||
                    !result.routes || result.routes.length < 1 ||
                    !result.routes[0].legs || result.routes[0].legs.length < 1) {

                    if (isDev()) {
                        console.log('\nStatus: ' + result.status);
                        console.log('\nResult: ');
                        console.log(result.routes);
                    }

                    error = new Error('Could not get directions with Google Maps');
                    error.code = '490';
                    reject(error);
                }

                var returnObj = {};
                returnObj[id] = result.routes[0];
                resolve(returnObj);
            }

        });
    });
};

//Calls Google Maps Distance Matrix API
exports.distanceMatrix = function(origins, destinations, cb) {
    var error;
    var errorCount = 0;

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

            gm.distance(params, processDistance);

            function processDistance(err, result) {
                if (err) {
                    if (isDev()) console.log(err);
                    errorCount++;

                    //If there an error, try again, but only twice
                    if (errorCount > 1) reject(err);
                    else gm.distance(params, processDirections);
                }

                if (result.status == "OVER_QUERY_LIMIT") {
                    error = new Error('Reached Google Maps API limit');
                    error.code = '490';
                    reject(error);
                }

                if (result.status != "OK" ||
                    !result.rows || result.rows.length < 1 ||
                    !result.rows[0].elements || result.rows[0].elements.length < 1) {
                    if (isDev()) {
                        console.log('\nStatus: ' + result.status);
                        console.log('\nResult: ');
                        console.log(result.rows);
                    }

                    error = new Error('Could not get directions with Google Maps');
                    error.code = '490';
                    reject(error);
                }

                resolve(result);
            }
        });
    });
};

/**
 * Formatting helper functions
 */

//Formats various inputs into an object with an address string and an optional country property
function formatLocation(location) {
    //location is an address string
    if (typeof location == 'string') return addressStringWithCountry(location);

    //location is a lat/lng object
    if (location.lat && location.lng) {
        var locObj = {};
        locObj.string = location.lat + ',' + location.lng;
        return locObj;
    }

    //location is address object
    if (location.street) return addressObjectToString(location);

    //location is an order w/ address
    if (location.customer_address) return addressObjectToString(location.customer_address);

    //If none of the above, error
    var error = new Error('Location is not a valid type');
    error.code = '490';
    return error;
}

//Returns object with address string and country
function addressObjectToString(object) {
    var error;
    var address = object;
    var zipcode = address.zip;
    var country = supportedCountry(zipcode);
    var returnObj = {};

    if (!country || country.length < 1) {
        error = new Error('Country not supported for directions');
        error.code = '400';
        return error;
    }

    //Stringify customer address
    var addressStr = address.street;
    if (address.unit) addressStr = addressStr + ' ' + address.unit;
    addressStr = addressStr + ', ' + address.city;
    if (address.state) addressStr = addressStr + ' ' + address.state;
    addressStr = addressStr + ' ' + address.zip;
    addressStr = addressStr + ', ' + country;

    returnObj.string = addressStr;
    returnObj.country = country;
    return returnObj;
}

//Returns object with address string and country
function addressStringWithCountry(address) {
    var error;
    var returnObj = {};

    var country = getCountryFromAddress(address);

    if (!country || country.length < 1) {
        error = new Error('Country not supported for directions');
        error.code = '400';
        return error
    }
    returnObj.string = address + ', ' + country;
    returnObj.country = country;
    return returnObj;
}

//Get country from an address string with zipcode
function getCountryFromAddress(address) {
    var components = address.split(' ');
    var zipcode = components[components.length - 1];
    return supportedCountry(zipcode);
}

function isDev() {
    if (process.env.NODE_ENV == 'dev') return true;
    else return false;
}