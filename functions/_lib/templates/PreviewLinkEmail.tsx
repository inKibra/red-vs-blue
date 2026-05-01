import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type PreviewLinkEmailProps = {
  /** Absolute, ready-to-click URL containing the signed claim token. */
  link: string;
  /** Bare host shown to the reader so they can sanity-check the URL. */
  domain: string;
};

const palette = {
  page: "#f4f1e8",
  panel: "#fbf8ef",
  ink: "#171a16",
  inkSoft: "#41433a",
  muted: "#73796e",
  rule: "#171a1626",
  accent: "#314b3f",
  accentSoft: "#dce5dc",
};

const fontStack = "'Inria Serif', Iowan Old Style, Georgia, serif";
const monoStack = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

/**
 * Sent by /api/poll/preview-link when a returning user requests their
 * /results preview without typing a 6-digit code.
 *
 * The button is the primary CTA; a copy of the URL appears below for clients
 * (terminal mail clients, plain-text views) that don't render buttons. The
 * 1-hour expiry is stated explicitly so users don't open day-old emails and
 * wonder why the link is dead.
 */
export default function PreviewLinkEmail({
  link,
  domain,
}: PreviewLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Threshold Study results preview</Preview>
      <Body style={{ backgroundColor: palette.page, margin: 0, padding: 0 }}>
        <Container
          style={{
            maxWidth: 540,
            margin: "0 auto",
            padding: "32px 16px",
            fontFamily: fontStack,
            color: palette.ink,
          }}
        >
          <Section
            style={{
              backgroundColor: palette.panel,
              border: `1px solid ${palette.rule}`,
              padding: "32px 28px",
            }}
          >
            <Text
              style={{
                margin: 0,
                color: palette.muted,
                fontFamily: monoStack,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              The Threshold Study
            </Text>
            <Heading
              style={{
                margin: "10px 0 16px",
                fontWeight: 300,
                fontSize: 32,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: palette.ink,
              }}
            >
              Your results preview
            </Heading>
            <Text
              style={{
                margin: 0,
                fontSize: 16,
                lineHeight: 1.55,
                color: palette.inkSoft,
              }}
            >
              Click below to open your live results page on{" "}
              <strong>{domain}</strong>. The link logs you in for one hour.
            </Text>

            <Section
              style={{
                margin: "26px 0 18px",
                textAlign: "center" as const,
              }}
            >
              <Button
                href={link}
                style={{
                  backgroundColor: palette.accent,
                  color: palette.panel,
                  fontFamily: monoStack,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  padding: "14px 22px",
                  textDecoration: "none",
                }}
              >
                Open my results
              </Button>
            </Section>

            {/* Plain-URL fallback. Some clients strip <Button>; keeping the */}
            {/* full URL as text means even mutt readers can copy it.        */}
            <Text
              style={{
                margin: "0 0 12px",
                fontSize: 12,
                fontFamily: monoStack,
                color: palette.muted,
                wordBreak: "break-all" as const,
              }}
            >
              {link}
            </Text>

            <Hr style={{ borderColor: palette.rule, margin: "20px 0 14px" }} />
            <Text style={{ margin: 0, fontSize: 13, color: palette.muted }}>
              Link expires in 1 hour. If you didn&apos;t ask for it, ignore
              this message.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
