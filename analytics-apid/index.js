'use strict';

var debug = require('debug')('plugin:new-analytics');
var ApidAnalytics = require('./apidanalytics');
const onFinished = require('on-finished');
module.exports.init = function(config, logger, stats) {

  const analytics = ApidAnalytics.create(config, logger);
  var prematureErrorListener;
  return {
    testprobe: function() { return analytics },
    onrequest: function(req, res, targetReq, targetRes, data, next) {
      if(!req._clientReceived) {
        req._clientReceived = Date.now();
      }
        
      onFinished(res, () => {
        //No target response? Well that means something bad happened in EM.
        if(!targetRes) {
          var record = {
            response_status_code: res.statusCode,
            client_received_start_timestamp: req._clientReceived,
            client_received_end_timestamp: req._clientReceived + 1,
            scopeId: res.proxy.scope
          }; 
          
          
          if(req.headers['x-api-key']) {
            record.client_id = req.headers['x-api-key'];
          }
          
          analytics.push(record);
        }
      });

      next();
    },
    ondata_request:function(req, res, targetReq, targetRes, data, next) {
      if(!req._streamStarted) {
        req._streamStarted = Date.now();
      } 
      next(null, data);
    },
    onend_request:function(req, res, targetReq, targetRes, data, next) {
      if(!req._streamStarted) {
        req._streamStarted = Date.now();
      } 

      if(!req._streamEnded) {
        req._streamEnded = Date.now();
      }

      if(!req._clientReceivedEnd) {
        req._clientReceivedEnd = Date.now();
      }
      next(null, data);
    },
    ondata_response:function(req, res, targetReq, targetRes, data, next) {
      if(!targetReq._streamStarted) {
        targetReq._streamStarted = Date.now();
      }
      next(null, data);
    },
    onend_response:function(req, res, targetReq, targetRes, data, next) {
      if(!targetReq._streamStarted) {
        targetReq._streamStarted = Date.now();
      }

      if(!targetReq._streamEnded) {
        targetReq._streamEnded = Date.now();
      }

      if(prematureErrorListener) {
        res.removeListener('finish', prematureErrorListener);
      }

      onFinished(res, (err) => {
        if(!res._writeToClientEnd) {
          res._writeToClientEnd = Date.now();
        }

        var record = {
          apiproxy: res.proxy.proxy_name,
          apiproxy_revision: res.proxy.revision,
          client_ip: req.connection.remoteAddress,
          client_received_start_timestamp:req._clientReceived,
          client_received_end_timestamp:req._clientReceivedEnd,
          client_sent_start_timestamp: res._writeToClientStart,
          client_sent_end_timestamp: res._writeToClientEnd,
          gateway_flow_id: req._gatewayFlowId,
          request_path: req.url.split('?')[0],
          request_uri: (req.protocol || 'http') + '://' + req.headers.host + req.url,
          request_verb: req.method,
          response_status_code: res.statusCode,
          useragent: req.headers['user-agent'],
          target_received_end_timestamp: req._streamEnded,
          target_received_start_timestamp: req._streamStarted,
          target_response_code: targetRes.statusCode,
          target_sent_end_timestamp: targetReq._streamEnded,
          target_sent_start_timestamp: targetReq._streamStarted,
          target: res.proxy.target_name,
          recordType: 'APIAnalytics',
          scopeId: res.proxy.scope
        };

        if(req.headers['x-api-key']) {
          record.client_id = req.headers['x-api-key'];
        }
        
        analytics.push(record);
      });
      
      next(null, data);
    },
    onresponse: function(req, res, targetReq, targetRes, data,  next) {
      var writeToRes = res.write;

      res.write = (chunk, encoding, callback) => {
        if(!res._writeToClientStart) {
          res._writeToClientStart = Date.now();
        }
        writeToRes.call(res, chunk, encoding, callback);
      }

      
      next();
    }
  };

}