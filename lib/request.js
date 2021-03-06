'use strict';

var https = require('https');
var http = require('http');
var parse = require('url').parse;
var once = require('./once');

function request(timeout, secure) {
  //
  // request issues an https request.  To generate a function that will issue
  // network requests, you must call this module with an optional timeout and
  // optional boolean for whether or not to use HTTPS.
  //
  // The returned function may then be invoked with arguments specific to a
  // given request.
  //
  // ## Usage
  //
  // request(3000, true)({
  //   method: 'GET',
  //   path: '/v1/blorp/blorp-1'
  //   hostname: 'api.bloop.com',
  // }, function(err, res) {
  //   ...
  // });
  //
  // request(3000, true)({
  //   method: 'POST',
  //   path: '/v1/blorp/blorp-1'
  //   hostname: 'api.bloop.com',
  //   auth: apiKey + ':',
  //   headers: { 'Content-Type': 'application/json' }
  // }, { type: blorp, blorpCount: 1 }, function(err, res) {
  //   ...
  // });
  //
  return function _request(options, data, callback) {

    if (typeof data === 'function') {
      callback = data;
      data = null;
    }

    callback = once(callback);

    var req = (secure ? https : http).request(options);

    req.on('response', responseHandler(callback));
    req.on('error', errorHandler(callback));

    if (typeof timeout === 'number') {
      req.setTimeout(timeout, timeoutHandler(callback, req));
    }

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  };
}

function responseHandler(callback) {
  return function _responseHandler(res) {
    res.setEncoding('utf8');
    var rawResponse = '';

    res.on('data', function onData(chunk) {
      rawResponse = rawResponse + chunk;
    });

    res.on('end', function onEnd() {
      if (!rawResponse) {
        return callback(
          formatError('Client received an empty response from the server', res),
          null
        );
      }

      try {
        var response = JSON.parse(rawResponse);
      } catch (e) {
        return callback(
          formatError('Error parsing response as JSON: ' + rawResponse, res),
          null
        );
      }

      if (typeof response.meta !== 'object' || !response.meta.status) {
        return callback(
          formatError('Invalid response: ' + rawResponse, res),
          null
        );
      }

      var status = response.meta.status;

      if (status === 'ok') {
        return callback(null, formatResponse(response));
      }

      var msg;
      if (status === 'error') {
        if (typeof response.error !== 'object' || !response.error.message) {
          msg = 'Invalid response: ' + rawResponse;
        } else {
          msg = response.error.message;
        }
      } else {
        msg = 'Unknown status: ' + status;
      }
      return callback(formatError(msg, res), null);
    });
  };
}

function errorHandler(callback) {
  return function _errorHandler(e) {
    callback(e, null);
  };
}

function timeoutHandler(callback, req) {
  return function _timeoutHandler() {
    req.abort();
    callback(new Error('Request timed out'), null);
  };
}

function formatResponse(response) {
  return {
    data: response.object !== undefined ? response.object : response.objects,
    meta: {
      next: formatCursor(response.meta.next),
      previous: formatCursor(response.meta.previous)
    }
  };
}

function formatError(message, response) {
  var err = new Error(message);
  err.response = response;
  return err;
}

function formatCursor(url) {
  if (typeof url === 'string') {
    var parsed = parse(url, true);
    return parsed.query.cursor || null;
  } else {
    return null;
  }
}

module.exports = request;
