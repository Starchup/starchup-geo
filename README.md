# Starchup Geo module
Various required Starchup geo-related components - best way to modularize the geocoding 
functionality for our sites.

# Installation

    npm install starchup-geo

# Components:

* City from Zipcode
* Zipcode from location
* Geocoder
* Bulk Geocoder //TODO
* Reverse-geocoder //TODO
* Bulk Reverse-geocoder //TODO

# Usage
    var geo = new require('starchup-geo')({api_key: _GOOGLE_KEY_});

    geo.cityForZip(zipcode, function(err, city) {});
    geo.zipForLocation({lat: latitude, lng: longitude}, function(err, zipcode) {});
    geo.geocode(addressString, function(err, location) {});