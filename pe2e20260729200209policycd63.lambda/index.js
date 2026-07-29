"use strict";

exports.handler = async () => ({
  body: JSON.stringify({ status: "ok" }),
  statusCode: 200,
});
