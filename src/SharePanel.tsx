import { useState } from "react";

/**
 * Shared share-with-three controls used by:
 *   - /case-study CTA at the bottom of the page
 *   - /results locked-cohort skeleton
 *   - (any other place we want a uniform "Share on X / Copy link" pair)
 *
 * Builds the share URL from the user's share_code so the recipient lands on
 * the survey root with their answer attributed to this user's cohort:
 *   https://<host>/?ref=<shareCode>
 *
 * When `shareCode` is null (e.g. the viewer's cookies didn't let the server
 * resolve their share_code), we fall back to a bare site URL with no
 * attribution. The buttons still work; the recipient just won't be linked
 * back to the user's cohort tree. The `<ShareCodeMissingHint />` element
 * surfaces this path so the user knows attribution is off.
 */
export function SharePanel({
  shareCode,
  tweetText,
  variant = "default",
}: {
  shareCode: string | null;
  /** Body of the tweet. Should NOT contain the URL — we add &url=. */
  tweetText: string;
  /** Visual variant; "compact" trims padding for tight contexts. */
  variant?: "default" | "compact";
}) {
  const [copied, setCopied] = useState(false);
  const shareUrl =
    typeof window === "undefined"
      ? ""
      : shareCode
        ? `${window.location.origin}/?ref=${shareCode}`
        : `${window.location.origin}/`;
  const tweetUrl =
    "https://twitter.com/intent/tweet?text=" +
    encodeURIComponent(tweetText) +
    "&url=" +
    encodeURIComponent(shareUrl);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard API unavailable — surface the URL inline as fallback */
    }
  }

  return (
    <div className={`share-panel share-panel--${variant}`}>
      <div className="share-panel-actions">
        <a
          className="share-twitter"
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Share on X. Opens in a new tab. Tweet text: ${tweetText}`}
        >
          Share on X
        </a>
        <button
          type="button"
          className="share-copy"
          onClick={copy}
          aria-live="polite"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
      <div className="share-panel-url" aria-label="Your share URL">
        {shareUrl}
      </div>
      {shareCode === null && (
        <p className="share-panel-warning">
          We couldn’t attribute this share to your cohort. Open{" "}
          <a href="/results">your results</a> to refresh your session, then
          come back.
        </p>
      )}
    </div>
  );
}
