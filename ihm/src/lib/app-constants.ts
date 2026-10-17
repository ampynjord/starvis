export const PUBLIC_RSI_URL = (process.env.NEXT_PUBLIC_RSI_URL ?? 'https://robertsspaceindustries.com').replace(/\/$/, '');
/** Bug reports go to the public issue tracker: there are no accounts to file them in-app. */
export const ISSUES_URL = (process.env.NEXT_PUBLIC_ISSUES_URL ?? 'https://github.com/ampynjord/starvis/issues').replace(/\/$/, '');
