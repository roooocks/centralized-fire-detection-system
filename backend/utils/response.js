function success(res, data, message = 'success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

function fail(res, message = 'error', statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    message
  });
}

module.exports = {
  success,
  fail
};
