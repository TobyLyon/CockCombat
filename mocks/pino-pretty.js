// Mock implementation for pino-pretty
module.exports = function pinoPretty(options) {
  return function(obj) {
    return JSON.stringify(obj, null, 2);
  };
};
