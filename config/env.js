const EXAMPLE_JWT_SECRET = "your_super_secret_random_string_at_least_32_characters";

// Settings the server can't run safely without. Returns a list of problems,
// empty when everything is in order.
export const findConfigProblems = (env) => {
    const problems = [];

    if (!env.MONGO_URI) {
        problems.push("MONGO_URI is missing");
    }

    if (!env.JWT_SECRET) {
        problems.push("JWT_SECRET is missing");
    } else if (env.JWT_SECRET === EXAMPLE_JWT_SECRET) {
        problems.push("JWT_SECRET is still the example value from .env.example");
    } else if (env.JWT_SECRET.length < 32) {
        problems.push("JWT_SECRET must be at least 32 characters");
    }

    // Only PayPal Sandbox is allowed, so the app can never take real money
    if (env.PAYPAL_ENV !== "sandbox") {
        problems.push("PAYPAL_ENV must be set to sandbox (live PayPal is not supported)");
    }

    // The credentials stay optional until payments are used, but come as a pair
    if (Boolean(env.PAYPAL_CLIENT_ID) !== Boolean(env.PAYPAL_CLIENT_SECRET)) {
        problems.push("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set together");
    }

    return problems;
};
