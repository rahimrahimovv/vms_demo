/**
 * What the screen shows when a message key is missing from messages/en.json: never the bare key (a raw "home.cardLabels.x" can
 * pass for a label), but an unmistakable marker. next-intl also logs the error, which the Next.js dev overlay lists as an issue.
 * tests/unit/messages.test.ts fails the build for every key that the code can use and the file lacks.
 */
export function missingMessage(namespace: string | undefined, key: string): string {
  return `[missing text: ${[namespace, key].filter(Boolean).join(".")}]`;
}
