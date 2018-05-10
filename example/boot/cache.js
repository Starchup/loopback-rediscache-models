module.exports = function startCache(app)
{
	var cache = require('../../cache.js')(
	{
		app: app,
		models: ['Customer']
	});
};