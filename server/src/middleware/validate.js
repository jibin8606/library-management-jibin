const { AppError } = require('../utils/errors');

/** validate(zodSchema, 'body' | 'query') - replaces req[source] with the parsed value. */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    return next(
      new AppError(
        400,
        'VALIDATION_ERROR',
        'Request validation failed',
        result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      )
    );
  }
  req[source] = result.data;
  next();
};

module.exports = { validate };
