// FR-16: Cognito-managed logins. Calls Cognito's IdP service directly with
// USER_PASSWORD_AUTH (no hosted-UI redirect, no AWS SDK dependency) - the
// small set of reviewer accounts are created out-of-band via
// `aws cognito-idp admin-create-user`, so this only needs to handle sign-in
// and the first-login "force new password" challenge that flow produces.

const REGION = import.meta.env.VITE_AWS_REGION;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const IDP_ENDPOINT = `https://cognito-idp.${REGION}.amazonaws.com/`;
const STORAGE_KEY = 'ads_auth_tokens';

function loadTokens() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveTokens(tokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

function clearTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

async function cognitoRequest(target, body) {
  const res = await fetch(IDP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.__type || 'Cognito request failed');
  }
  return data;
}

export async function login(username, password) {
  const data = await cognitoRequest('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });

  if (data.AuthenticationResult) {
    saveTokens(data.AuthenticationResult);
    return { done: true };
  }
  if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    return { done: false, challenge: 'NEW_PASSWORD_REQUIRED', session: data.Session, username };
  }
  throw new Error(`Unsupported auth challenge: ${data.ChallengeName}`);
}

export async function completeNewPassword(username, newPassword, session) {
  const data = await cognitoRequest('RespondToAuthChallenge', {
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    ClientId: CLIENT_ID,
    Session: session,
    ChallengeResponses: { USERNAME: username, NEW_PASSWORD: newPassword },
  });
  if (!data.AuthenticationResult) throw new Error('Failed to complete the new-password challenge');
  saveTokens(data.AuthenticationResult);
  return { done: true };
}

export async function refresh() {
  const tokens = loadTokens();
  if (!tokens || !tokens.RefreshToken) return null;
  try {
    const data = await cognitoRequest('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: tokens.RefreshToken },
    });
    const merged = { ...tokens, ...data.AuthenticationResult };
    saveTokens(merged);
    return merged;
  } catch {
    clearTokens();
    return null;
  }
}

export function logout() {
  clearTokens();
}

export function getIdToken() {
  const tokens = loadTokens();
  return tokens ? tokens.IdToken : null;
}

export function isLoggedIn() {
  return Boolean(getIdToken());
}
