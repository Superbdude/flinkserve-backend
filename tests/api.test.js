Coverage is generated from the `tests/` directory using Jest.

Run the full suite locally:

    npm test

To run only the smoke tests against the live service (faster, no mocks needed):

    API_BASE_URL=https://flinkserve-backend.onrender.com npx jest tests/api.test.js --testPathPattern=api

For coverage:

    npm test -- --coverage

Keep the `tests/` folder in version control so CI can run them before a deploy.
