import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type OtcEmailProps = {
  code: string;
  /** Bare host (no scheme), used for the Apple Domain-Bound Codes line. */
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

const fontStack =
  "'Inria Serif', Iowan Old Style, Georgia, serif";
const monoStack =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

export default function OtcEmail({ code, domain }: OtcEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your verification code: {code}</Preview>
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
              Confirm your email
            </Heading>
            <Text style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: palette.inkSoft }}>
              Enter this 6-digit code on the page where you submitted your
              response to confirm your email.
            </Text>

            <Section
              style={{
                margin: "28px 0 24px",
                padding: "20px 22px",
                backgroundColor: palette.accentSoft,
                border: `1px solid ${palette.accent}`,
                fontFamily: monoStack,
                fontSize: 30,
                letterSpacing: "0.32em",
                textAlign: "center" as const,
                color: palette.accent,
              }}
            >
              {code}
            </Section>

            <Text style={{ margin: 0, fontSize: 14, color: palette.muted }}>
              This code expires in 30 minutes. If you didn&apos;t request it,
              ignore this message.
            </Text>

            <Hr style={{ borderColor: palette.rule, margin: "28px 0 14px" }} />
            <Text
              style={{
                margin: 0,
                color: palette.muted,
                fontFamily: monoStack,
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Anonymous · single submission
            </Text>

            {/*
              Apple Domain-Bound Codes format. Tells iOS Mail / Safari that
              this OTC is bound to `domain` so the keyboard suggestion bar will
              autofill it on a page with `autocomplete="one-time-code"` served
              from the same host. Must appear in plain text too — react-email's
              plainText render preserves Text element content. Keep this on its
              own line, no other 6-digit numbers nearby.
              See: https://developer.apple.com/documentation/security/password-autofill/enabling-domain-bound-codes-for-autofill
            */}
            <Text
              style={{
                margin: "14px 0 0",
                fontFamily: monoStack,
                fontSize: 12,
                color: palette.muted,
              }}
            >
              {`@${domain} #${code}`}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
