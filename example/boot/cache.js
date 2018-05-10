var Cache = require('../../cache.js');

module.exports = function startCache(app)
{
	var cache = Cache(
	{
		app: app,
		models: ['Customer']
	});
};