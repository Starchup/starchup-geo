var zipp = require('node-zippopotamus');
var GoogleMapsAPI = require('googlemaps');

var RateLimiter = require('limiter').RateLimiter;
var limiter = new RateLimiter(1, 100);

/**
 * Dictionary to return zipcode format for particular countries
 */
var zipcodeFormats = {
    'us': "^[a-zA-Z0-9]{5}([- ][a-zA-Z0-9]{4})?$",
    'za': "^[a-zA-Z0-9]{4}$",
    'ca': "^[a-zA-Z0-9]{3}(( )?[a-zA-Z0-9]{3})?$"
};

/**
 * Dictionary to convert country returned by Google Places Autofill to country code.
 * Add countries as Starchup supports more.
 */
var countryCode = {
    'United States': 'us',
    'Canada': 'ca',
    'South Africa': 'za',
};

var GEO = function (config)
{
    var self = this;

    if (!config || !config.api_key) throw new Error("Missing config or API key");

    self.gm = new GoogleMapsAPI(
    {
        key: config.api_key
    });

    /**
     * Utility to support various countries
     */
    self.supportedCountry = function (zipcode)
    {
        if (!zipcode || zipcode === undefined) return null;

        for (var countryCode in zipcodeFormats)
        {
            if (!zipcodeFormats.hasOwnProperty(countryCode)) continue;

            var zipcodeExp = zipcodeFormats[countryCode];
            if (zipcode.match(zipcodeExp)) return countryCode;
        }
        return null;
    }

    /**
     * Get the city matched to a provided zipcode
     *
     * param {zipcode} the zipcode to match
     *
     * return city
     */
    self.cityForZip = function (zipcode, cb)
    {
        var country = self.supportedCountry(zipcode);
        if (!country || country.length < 1)
        {
            var error = new Error('Zipcode format invalid or country not supported');
            error.code = '400';
            return cb(error);
        }

        if (country == 'ca') zipcode = zipcode.slice(0, 3);

        zipp(country, zipcode, function (err, json)
        {
            if (err) return cb(err);
            if (json.places.length < 1)
            {
                err = new Error('Could not get valid city for address');
                err.code = '400';
                return cb(err);
            }
            try
            {
                cb(err, json.places[0]["place name"]);
            }
            catch (ex)
            {
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
    self.geocode = function (identifier, address)
    {
        return new Promise(function (resolve, reject)
        {
            var errorCount = 0;

            var country = countryCode[address.country];
            if (!country && address.zip) country = self.supportedCountry(address.zip);
            if (!country || country.length < 1)
            {
                var error = new Error('Country not supported for geocoding');
                error.code = '400';
                return reject(error);
            }

            var id = identifier;
            var add = self.util.formatLocation(address);
            limiter.removeTokens(1, function (err, remainingRequests)
            {
                var params = {
                    "address": add,
                    "components": "components=country:" + country,
                    "language": "en",
                    "region": country
                };
                self.gm.geocode(params, processGeocode);

                function processGeocode(err, result)
                {
                    if (err)
                    {
                        errorCount++;

                        if (errorCount > 1) return reject(err);
                        else return self.gm.geocode(params, processGeocode);
                    }

                    if (result.status == "OVER_QUERY_LIMIT")
                    {
                        var error = new Error('Reached Google Maps API limit');
                        error.code = '490';
                        return reject(error);
                    }

                    if (result.status != "OK" || result.results.length < 1)
                    {
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
    self.reverseGeocode = function (identifier, location, options)
    {
        var errorCount = 0;
        var id = identifier;
        if (!options) options = {};

        var latLng = self.util.formatLocation(location);

        return new Promise(function (resolve, reject)
        {

            limiter.removeTokens(1, function (err, remainingRequests)
            {

                var params = {
                    'latlng': latLng,
                    'language': 'en' || options.language,
                    'location_type': 'ROOFTOP'
                };

                if (options.result_types)
                {
                    var result_type = "";
                    options.result_types.forEach(function (type, idx)
                    {
                        if (idx > 0) result_type += '|';
                        result_type += type;
                    });
                    params.result_type = result_type;
                }

                if (options.location_types)
                {
                    var location_type = "";
                    options.location_types.forEach(function (type, idx)
                    {
                        if (idx > 0) location_type += '|';
                        location_type += type;
                    });
                    params.location_type = location_type;
                }

                self.gm.reverseGeocode(params, processGeocode);

                function processGeocode(err, result)
                {
                    if (err)
                    {
                        errorCount++;

                        if (errorCount > 1) return reject(err);
                        else return self.gm.reverseGeocode(params, processGeocode);
                    }

                    if (result.status == "OVER_QUERY_LIMIT")
                    {
                        var error = new Error('Reached Google Maps API limit');
                        error.code = '490';
                        return reject(error);
                    }

                    //Allow empty result array
                    if (result.status == 'ZERO_RESULTS')
                    {
                        var returnObj = {};
                        returnObj.identifier = identifier;
                        returnObj.results = result.results;
                        return resolve(returnObj);
                    }

                    if (result.status != "OK" || result.results.length < 1)
                    {
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
    self.directions = function (identifier, origin, destination, waypoints, date, manualRoute)
    {
        var id = identifier;
        var orig;
        var error;
        var errorCount = 0;
        var dest = destination;

        if (!origin || !destination)
        {
            error = new Error('No origin or destination provided');
            error.code = '490';
            return Promise.reject(error);
        }

        orig = self.util.formatLocation(origin);
        dest = self.util.formatLocation(destination);

        waypoints = waypoints.map(function (wp)
        {
            return self.util.formatLocation(wp);
        });

        //If error, reject
        if (orig instanceof Error) return Promise.reject(orig);
        if (dest instanceof Error) return Promise.reject(dest);

        return new Promise(function (resolve, reject)
        {
            limiter.removeTokens(1, function (err, remainingRequests)
            {
                var params = {
                    origin: orig,
                    destination: dest,
                    region: origin.country
                };

                if (waypoints && waypoints.length > 0)
                {
                    var locations;
                    if (!manualRoute) locations = "optimize:true";
                    else locations = "optimize:false";

                    waypoints.forEach(function (waypoint)
                    {
                        locations = locations + "|" + waypoint;
                    });
                    params.waypoints = locations;
                }

                if (date) params.departureTime = date;

                self.gm.directions(params, processDirections);

                function processDirections(err, result)
                {
                    if (err)
                    {
                        errorCount++;

                        //If there an error, try again, but only twice
                        if (errorCount > 1) return reject(err);
                        else return self.gm.directions(params, processDirections);
                    }

                    if (result.status == "OVER_QUERY_LIMIT")
                    {
                        error = new Error('Reached Google Maps API limit');
                        error.code = '490';
                        return reject(error);
                    }

                    if (result.status != "OK")
                    {
                        error = new Error('Could not get directions with Google Maps');
                        error.code = '490';
                        return reject(error);
                    }

                    if (result.directions)
                    {
                        var returnObj = {};
                        returnObj[id] = result;
                        resolve(returnObj);
                    }
                    else if (!result.routes || result.routes.length < 1 ||
                        !result.routes[0].legs || result.routes[0].legs.length < 1)
                    {
                        error = new Error('Could not get directions with Google Maps');
                        error.code = '490';
                        return reject(error);
                    }

                    var returnObj = {};
                    returnObj[id] = result.routes[0];
                    resolve(returnObj);
                }

            });
        });
    };

    //Calls Google Maps Distance Matrix API
    self.distanceMatrix = function (origins, destinations, cb)
    {
        var error;
        var errorCount = 0;

        if (!origins.length || !destinations.length)
        {
            error = new Error('No origins or destinations provided');
            error.code = '490';
            return Promise.reject(error);
        }

        //Format for Google
        var originStrings = origins.map(function (origin)
        {
            return self.util.formatLocation(origin);
        });

        var destStrings = destinations.map(function (destination)
        {
            return self.util.formatLocation(destination);
        });

        var theOrigins = originStrings.join('|');
        var theDestinations = destStrings.join('|');

        return new Promise(function (resolve, reject)
        {
            limiter.removeTokens(1, function (err, remainingRequests)
            {
                var params = {
                    origins: theOrigins,
                    destinations: theDestinations,
                };

                self.gm.distance(params, processDistance);

                function processDistance(err, result)
                {
                    if (err)
                    {
                        errorCount++;

                        //If there an error, try again, but only twice
                        if (errorCount > 1) return reject(err);
                        else return self.gm.distance(params, processDistance);
                    }

                    if (result.status == "OVER_QUERY_LIMIT")
                    {
                        error = new Error('Reached Google Maps API limit');
                        error.code = '490';
                        return reject(error);
                    }

                    if (result.status != "OK" ||
                        !result.rows || result.rows.length < 1 ||
                        !result.rows[0].elements || result.rows[0].elements.length < 1)
                    {
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
     * param {point}        Required. A geopoint or lat/lng object
     * param {coords}       Required. An array of {lat: , lng: } objects
     *
     * return {bool}
     */
    self.pointInPolygon = function (point, coords)
    {
        var latlng;

        //Accept geopoint object as well as Lat/Long object
        if (point.location) point = point.location;

        if (self.util.exists(point.lat) && self.util.exists(point.lng))
        {
            latlng = {
                lat: point.lat,
                lng: point.lng
            };
        }
        else if (self.util.exists(point.lat) && self.util.exists(point.lng))
        {
            point = point;
        }
        else
        {
            error = new Error('Point must have lat and lng');
            error.code = '490';
            return error;
        }

        //Accept points arrays and whole polygon objects
        if (coords.points) coords = coords.points;

        //Format to geolib required format
        var formattedCoords = coords.map(function (coord)
        {
            if (self.util.exists(coord.lat) && self.util.exists(coord.lng))
            {
                return {
                    lat: coord.lat,
                    lng: coord.lng
                };
            }
            else if (self.util.exists(coord.lat) && self.util.exists(coord.lng))
            {
                return coord;
            }
        });

        for (var c = false, i = -1, l = coords.length, j = l - 1; ++i < l; j = i)
        {
            if (
                (
                    (coords[i].lng <= latlng.lng && latlng.lng < coords[j].lng) ||
                    (coords[j].lng <= latlng.lng && latlng.lng < coords[i].lng)
                ) &&
                (
                    latlng.lat < (coords[j].lat - coords[i].lat) *
                    (latlng.lng - coords[i].lng) /
                    (coords[j].lng - coords[i].lng) +
                    coords[i].lat
                )
            )
            {
                c = !c;
            }
        }
        return c;
    }


    /**
     * Formatting helper functions
     */
    self.util = {
        //Formats various inputs into an object with an address string and an optional country property
        formatLocation: function (location)
        {

            location = JSON.parse(JSON.stringify(location));

            //Location is a facility or order
            if (location.postal_address) location = location.postal_address;
            if (location.customer_address) location = location.customer_address;
            if (location.address) location = location.address;

            var loc = location;

            //Get to lowest location object/relation
            while (loc.location)
            {
                loc = loc.location
            }

            if (self.util.exists(loc.lat) && self.util.exists(loc.lng))
            {
                return loc.lat + ',' + loc.lng;
            }

            if (self.util.exists(loc.latitude) && self.util.exists(loc.longitude))
            {
                return loc.latitude + ',' + loc.longitude;
            }

            //location is address object
            if (location.street) return self.util.addressObjectToString(location);

            //If none of the above, error
            var error = new Error('Location is not a valid type');
            error.code = '490';
            return error;
        },

        //Returns object with address string and country
        addressObjectToString: function (object)
        {
            var error;
            var address = object;

            var country = countryCode[address.country];
            if (!country) country = self.supportedCountry(address.zip);
            var returnObj = {};

            if (!country || country.length < 1)
            {;
                error = new Error('Country not supported for directions');
                error.code = '400';
                return error;
            }

            //Stringify customer address
            var addressStr = address.street;
            if (address.city) addressStr = addressStr + ', ' + address.city;
            if (address.state) addressStr = addressStr + ' ' + address.state;
            if (address.zip) addressStr = addressStr + ' ' + address.zip;

            return addressStr;
        },

        exists: function (val)
        {
            return val !== undefined && val !== null;
        }
    };
    return self;
};

module.exports = GEO;