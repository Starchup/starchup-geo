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
    'za': "^[a-zA-Z0-9]{4}$",
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
 * Dictionary to convert country returned by Google Places Autofill to country code.
 * Add countries as Starchup supports more.
 */
var countryCode = {
    'United States': 'us',
    'Canada': 'ca',
    'South Africa': 'za',
};

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
exports.geocode = function(identifier, address) {
    return new Promise(function(resolve, reject) {
        var errorCount = 0;

        var country = countryCode[address.country];

        if (!country && address.zip) country = supportedCountry(address.zip);

        if (!country || country.length < 1) {
            var error = new Error('Country not supported for geocoding');
            error.code = '400';
            return reject(error);
        }

        var id = identifier;
        var add = formatLocation(address);
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
                    if (isDev()) {
                        console.log(err);
                        console.log('\nPassed arguments: ');
                        console.log('\nIdentifier');
                        console.log(identifier);
                        console.log('\nAddress:');
                        console.log(address);
                        console.log('\nGoogle params');
                        console.log(params);
                    }
                    errorCount++;

                    if (errorCount > 1) return reject(err);
                    else return gm.geocode(params, processGeocode);
                }

                if (result.status == "OVER_QUERY_LIMIT") {
                    var error = new Error('Reached Google Maps API limit');
                    error.code = '490';
                    return reject(error);
                }

                if (result.status != "OK" || result.results.length < 1) {
                    if (isDev()) {
                        console.log('\nStatus: ' + result.status);
                        console.log('\nResult: ');
                        console.log(result.results);

                        console.log('\nPassed arguments: ');
                        console.log('\nIdentifier');
                        console.log(identifier);
                        console.log('\nAddress:');
                        console.log(address);
                        console.log('\nGoogle params');
                        console.log(params);
                    }

                    var error = new Error('Could not create address with Google Maps');
                    error.code = '490';
                    return reject(error);
                }

                var returnObj = {};
                returnObj[id] = result.results[0].geometry.location;
                resolve(returnObj);
            }
        });
    });
};

/**
 * Reverse Geocode an coordinates to an address
 *
 * param {identifier}       Identifier provided to return with the location
 * param {latLng}           Lat and Lng coordinates to geocode
 * param {options}          (Optional) options object
 *       param {result_types}          (Optional) array of Google result_types
 *       param {location_types}        (Optional) array of Google location_types.  Defaults to 'ROOFTOP' (address);
 *       param {language}              (Optional) language, defaults to 'en'
 *      
 *      Learn more about about Goolge reverse geocoding parameters:
 *      https://developers.google.com/maps/documentation/geocoding/intro#ReverseGeocoding
 *
 * return {identifier: identifier,
 *          results: results}
 *
 *  This function allows an empty array to be returned as a non-error result.  Any function calling this must account for that possibility.
 */
exports.reverseGeocode = function(identifier, location, options) {
    var errorCount = 0;
    var id = identifier;
    if (!options) options = {};

    var latLng = formatLocation(location);

    return new Promise(function(resolve, reject) {

        limiter.removeTokens(1, function(err, remainingRequests) {

            var params = {
                'latlng': latLng,
                'language': 'en' || options.language,
                'location_type': 'ROOFTOP'
            };

            if (options.result_types) {
                var result_type = "";
                options.result_types.forEach(function(type, idx) {
                    if (idx > 0) result_type += '|';
                    result_type += type;
                });
                params.result_type = result_type;
            }

            if (options.location_types) {
                var location_type = "";
                options.location_types.forEach(function(type, idx) {
                    if (idx > 0) location_type += '|';
                    location_type += type;
                });
                params.location_type = location_type;
            }

            gm.reverseGeocode(params, processGeocode);

            function processGeocode(err, result) {
                if (err) {
                    if (isDev()) {
                        console.log(err);
                        console.log('\nPassed arguments: ');
                        console.log('\nIdentifier');
                        console.log(identifier);
                        console.log('\nLocation');
                        console.log(location);
                        console.log('\nOptions');
                        console.log(options);
                        console.log('\nGoogle params');
                        console.log(params);
                    }
                    errorCount++;

                    if (errorCount > 1) return reject(err);
                    else return gm.geocode(params, processGeocode);
                }

                if (result.status == "OVER_QUERY_LIMIT") {
                    var error = new Error('Reached Google Maps API limit');
                    error.code = '490';
                    return reject(error);
                }

                //Allow empty result array
                if (result.status == 'ZERO_RESULTS') {
                    var returnObj = {};
                    returnObj.identifier = identifier;
                    returnObj.results = result.results;
                    return resolve(returnObj);
                }

                if (result.status != "OK" || result.results.length < 1) {
                    if (isDev()) {
                        console.log('\nStatus: ' + result.status);
                        console.log('\nResult: ');
                        console.log(result.results);

                        console.log('\nPassed arguments: ');
                        console.log('\nIdentifier');
                        console.log(identifier);
                        console.log('\nLocation');
                        console.log(location);
                        console.log('\nOptions');
                        console.log(options);
                        console.log('\nGoogle params');
                        console.log(params);
                    }

                    var error = new Error('Could not create address with Google Maps');
                    error.code = '490';
                    return reject(error);
                }

                var returnObj = {};
                returnObj.identifier = identifier;
                returnObj.results = result.results;
                return resolve(returnObj);
            }
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
exports.directions = function(identifier, origin, destination, waypoints, date, manualRoute) {
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

    waypoints = waypoints.map(function(wp) {
        return formatLocation(wp);
    });

    //If error, reject
    if (orig instanceof Error) return Promise.reject(orig);
    if (dest instanceof Error) return Promise.reject(dest);

    return new Promise(function(resolve, reject) {
        limiter.removeTokens(1, function(err, remainingRequests) {
            var params = {
                origin: orig,
                destination: dest,
                region: origin.country
            };

            if (waypoints) {
                var locations;
                if (!manualRoute) locations = "optimize:true";
                else locations = "optimize:false";

                waypoints.forEach(function(waypoint) {
                    locations = locations + "|" + waypoint;
                });
                params.waypoints = locations;
            }

            if (date) params.departureTime = date;

            gm.directions(params, processDirections);

            function processDirections(err, result) {
                if (err) {
                    if (isDev()) {
                        console.log(err);
                        console.log('\nPassed arguments: ');
                        console.log('\nOrigin:');
                        console.log(origin);
                        console.log('\nDestination:');
                        console.log(destination);
                        console.log('\nWaypoints');
                        console.log(waypoints);
                        console.log('\nDate');
                        console.log(date);
                        console.log('\nGoogle params');
                        console.log(params);
                    }
                    errorCount++;

                    //If there an error, try again, but only twice
                    if (errorCount > 1) return reject(err);
                    else return gm.directions(params, processDirections);
                }

                if (result.status == "OVER_QUERY_LIMIT") {
                    error = new Error('Reached Google Maps API limit');
                    error.code = '490';
                    return reject(error);
                }

                if (result.status != "OK" ||
                    !result.routes || result.routes.length < 1 ||
                    !result.routes[0].legs || result.routes[0].legs.length < 1) {

                    if (isDev()) {
                        console.log('\nStatus: ' + result.status);
                        console.log('\nResult: ');
                        console.log(result.routes);

                        console.log('\nPassed arguments: ');
                        console.log('\nOrigin:');
                        console.log(origin);
                        console.log('\nDestination:');
                        console.log(destination);
                        console.log('\nWaypoints');
                        console.log(waypoints);
                        console.log('\nDate');
                        console.log(date);
                        console.log('\nGoogle params');
                        console.log(params);
                    }

                    error = new Error('Could not get directions with Google Maps');
                    error.code = '490';
                    return reject(error);
                }

                var returnObj = {};
                returnObj[id] = result.routes[0];
                return resolve(returnObj);
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

    //Format for Google
    var originStrings = origins.map(function(origin) {
        return formatLocation(origin);
    });

    var destStrings = destinations.map(function(destination) {
        return formatLocation(destination);
    });

    var theOrigins = originStrings.join('|');
    var theDestinations = destStrings.join('|');

    return new Promise(function(resolve, reject) {
        limiter.removeTokens(1, function(err, remainingRequests) {
            var params = {
                origins: theOrigins,
                destinations: theDestinations,
            };

            gm.distance(params, processDistance);

            function processDistance(err, result) {
                if (err) {
                    if (isDev()) {
                        console.log(err);
                        console.log('\nPassed arguments: ');
                        console.log('\nOrigins:');
                        console.log(origins);
                        console.log('\nDestinations:');
                        console.log(destinations);
                        console.log('\nGoogle params');
                        console.log(params);
                    }
                    errorCount++;

                    //If there an error, try again, but only twice
                    if (errorCount > 1) return reject(err);
                    else return gm.distance(params, processDirections);
                }

                if (result.status == "OVER_QUERY_LIMIT") {
                    error = new Error('Reached Google Maps API limit');
                    error.code = '490';
                    return reject(error);
                }

                if (result.status != "OK" ||
                    !result.rows || result.rows.length < 1 ||
                    !result.rows[0].elements || result.rows[0].elements.length < 1) {
                    if (isDev()) {
                        console.log('\nStatus: ' + result.status);
                        console.log('\nResult: ');
                        console.log(result.rows);

                        console.log('\nPassed arguments: ');
                        console.log('\nOrigins:');
                        console.log(origins);
                        console.log('\nDestinations:');
                        console.log(destinations);
                        console.log('\nGoogle params');
                        console.log(params);
                    }

                    error = new Error('Could not get directions with Google Maps');
                    error.code = '490';
                    return reject(error);
                }

                return resolve(result);
            }
        });
    });
};


/**
 * Determine whether a lat/lng point is inside a polygon
 * 
 *
 * param {point}        Required. A geopoint or latitude/longitude object
 * param {coords}       Required. An array of {latitude: , longitude: } objects
 *
 * return {bool}
 */
exports.pointInPolygon = function(point, coords) {
    var latlng;

    //Accept geopoint object as well as Lat/Long object
    if (point.location) point = point.location;

    if (exists(point.lat) && exists(point.lng)) {
        latlng = {
            latitude: point.lat,
            longitude: point.lng
        };
    } else if (exists(point.latitude) && exists(point.longitude)) {
        point = point;
    } else {
        error = new Error('Point must have latitude and longitude');
        error.code = '490';
        return error;
    }

    //Accept points arrays and whole polygon objects
    if (coords.points) coords = coords.points;

    //Format to geolib required format
    var formattedCoords = coords.map(function(coord) {
        if (exists(coord.lat) && exists(coord.lng)) {
            return {
                latitude: coord.lat,
                longitude: coord.lng
            };
        } else if (exists(coord.latitude) && exists(coord.longitude)) {
            return coord;
        }
    });

    for (var c = false, i = -1, l = coords.length, j = l - 1; ++i < l; j = i) {
        if (
            (
                (coords[i].longitude <= latlng.longitude && latlng.longitude < coords[j].longitude) ||
                (coords[j].longitude <= latlng.longitude && latlng.longitude < coords[i].longitude)
            ) &&
            (
                latlng.latitude < (coords[j].latitude - coords[i].latitude) *
                (latlng.longitude - coords[i].longitude) /
                (coords[j].longitude - coords[i].longitude) +
                coords[i].latitude
            )
        ) {
            c = !c;
        }
    }
    return c;
}


/**
 * Formatting helper functions
 */

//Formats various inputs into an object with an address string and an optional country property
function formatLocation(location) {
    //Location is a facility or order
    if (location.postal_address) location = location.postal_address;
    if (location.customer_address) location = location.customer_address;
    if (location.address) location = location.address;

    //location is address object
    if (location.street) return addressObjectToString(location);

    //Get to lowerst location object/relation
    while (location.location) {
        location = location.location
    }

    if (exists(location.lat) && exists(location.lng)) return location.lat + ',' + location.lng;

    if (exists(location.latitude) && exists(location.longitude)) return location.latitude + ',' + location.longitude;

    //If none of the above, error
    var error = new Error('Location is not a valid type');
    error.code = '490';
    return error;
}

//Returns object with address string and country
function addressObjectToString(object) {
    var error;
    var address = object;

    var country = countryCode[address.country];
    if (!country) country = supportedCountry(address.zip);
    var returnObj = {};

    if (!country || country.length < 1) {;
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

    return addressStr;
}

//Get country from an address string with zipcode
function getCountryFromAddress(address) {
    var components = address.split(' ');
    var country = components[components.length - 1];
    return countryCode[country];
}

function isDev() {
    return (process.env.NODE_ENV == 'dev');
}

function exists(val) {
    return val !== undefined && val !== null;
}