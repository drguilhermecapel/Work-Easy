type Env = (name: string) => string | undefined;
const alertText = "Abra o WorkEasy para consultar as ofertas disponíveis.";
const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_")
    .replace(/=+$/, "");
const encode = (value: unknown) =>
  b64(new TextEncoder().encode(JSON.stringify(value)));
const requireSetting = (env: Env, name: string) => {
  const value = env(name);
  if (!value) throw new Error("ride_push_configuration_missing");
  return value;
};

async function jwt(
  header: Record<string, string>,
  claims: object,
  pem: string,
) {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----|\s|\\n/g, "")),
    (c) => c.charCodeAt(0),
  );
  const rsa = header.alg === "RS256";
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    rsa
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const message = encode(header) + "." + encode(claims);
  const signature = await crypto.subtle.sign(
    rsa ? "RSASSA-PKCS1-v1_5" : { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(message),
  );
  return message + "." + b64(new Uint8Array(signature));
}

export async function sendAlert(
  platform: "ios" | "android",
  token: string,
  leg: string,
  env: Env,
  send: typeof fetch = fetch,
) {
  const now = Math.floor(Date.now() / 1000);
  const timeout = () => AbortSignal.timeout(8000);
  if (platform === "ios") {
    const auth = await jwt(
      { alg: "ES256", kid: requireSetting(env, "RIDE_APNS_KEY_ID") },
      { iss: requireSetting(env, "RIDE_APNS_TEAM"), iat: now },
      requireSetting(env, "RIDE_APNS_PRIVATE_KEY"),
    );
    const host = env("RIDE_APNS_SANDBOX") === "true"
      ? "api.sandbox.push.apple.com"
      : "api.push.apple.com";
    const response = await send(
      "https://" + host + "/3/device/" + encodeURIComponent(token),
      {
        method: "POST",
        signal: timeout(),
        headers: {
          authorization: "bearer " + auth,
          "apns-topic": "br.com.workeasy",
          "apns-push-type": "alert",
          "apns-collapse-id": leg,
          "apns-expiration": String(now + 60),
        },
        body: JSON.stringify({
          aps: {
            alert: { title: "WorkEasy", body: alertText },
            sound: "default",
          },
        }),
      },
    );
    if (!response.ok) throw new Error("apns_delivery_failed");
    return;
  }
  const account = requireSetting(env, "RIDE_FCM_CLIENT_EMAIL");
  const authUrl = "https://oauth2.googleapis.com/token";
  const assertion = await jwt({ alg: "RS256", typ: "JWT" }, {
    iss: account,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: authUrl,
    iat: now,
    exp: now + 900,
  }, requireSetting(env, "RIDE_FCM_PRIVATE_KEY"));
  const auth = await send(authUrl, {
    method: "POST",
    signal: timeout(),
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!auth.ok) throw new Error("fcm_auth_failed");
  const access = (await auth.json()).access_token;
  if (typeof access !== "string" || !access) throw new Error("fcm_auth_failed");
  const project = encodeURIComponent(requireSetting(env, "RIDE_FCM_PROJECT"));
  const response = await send(
    "https://fcm.googleapis.com/v1/projects/" + project + "/messages:send",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + access,
        "Content-Type": "application/json",
      },
      signal: timeout(),
      body: JSON.stringify({
        message: {
          token,
          notification: { title: "WorkEasy", body: alertText },
          android: {
            priority: "high",
            ttl: "60s",
            collapse_key: leg,
            notification: { tag: leg },
          },
        },
      }),
    },
  );
  if (!response.ok) throw new Error("fcm_delivery_failed");
}
