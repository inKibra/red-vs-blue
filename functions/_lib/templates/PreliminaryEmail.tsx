import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export type PreliminaryEmailProps = {
  totalResponses: number;
  personalChoiceThresholdPct: number;
  publicRecommendationThresholdPct: number;
  dependentRecommendationThresholdPct: number;
  expectedMajorityThresholdPct: number;
  averageConfidence: number;
  /** Personal share URL with ?ref=<share_code> baked in. */
  shareUrl: string;
  /** Absolute URL to the published case study page. */
  caseStudyUrl: string;
  /** Absolute one-click unsubscribe URL (verified link). */
  unsubscribeUrl: string;
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

export default function PreliminaryEmail({
  totalResponses,
  personalChoiceThresholdPct,
  publicRecommendationThresholdPct,
  dependentRecommendationThresholdPct,
  expectedMajorityThresholdPct,
  averageConfidence,
  shareUrl,
  caseStudyUrl,
  unsubscribeUrl,
}: PreliminaryEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Two-thirds of respondents picked their answer with maximum confidence. The crowd is still split.
      </Preview>
      <Body style={{ backgroundColor: palette.page, margin: 0, padding: 0 }}>
        <Container
          style={{
            maxWidth: 600,
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
              padding: "36px 30px",
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
              Threshold Study · interim
            </Text>
            <Heading
              style={{
                margin: "10px 0 18px",
                fontWeight: 300,
                fontSize: 36,
                lineHeight: 1,
                letterSpacing: "-0.025em",
              }}
            >
              The crowd is split. Your friends are the missing layer.
            </Heading>
            <Text style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              {totalResponses.toLocaleString()} people have answered. The crowd is close to a coin flip — and the gap between what people will choose, what they&apos;ll recommend, and what they expect everyone else to do is the part we can&apos;t see from a global average.
            </Text>

            <Section style={{ margin: "28px 0 0" }}>
              <Row>
                <Column style={{ width: "25%", paddingRight: 4 }}>
                  <StatBlock label="Chose group-dependent" value={`${personalChoiceThresholdPct}%`} small />
                </Column>
                <Column style={{ width: "25%", padding: "0 4px" }}>
                  <StatBlock label="Recommend it publicly" value={`${publicRecommendationThresholdPct}%`} small />
                </Column>
                <Column style={{ width: "25%", padding: "0 4px" }}>
                  <StatBlock label="Recommend it to a dependent" value={`${dependentRecommendationThresholdPct}%`} small />
                </Column>
                <Column style={{ width: "25%", paddingLeft: 4 }}>
                  <StatBlock label="Expect the majority will" value={`${expectedMajorityThresholdPct}%`} small />
                </Column>
              </Row>
            </Section>

            <Text style={{ margin: "24px 0 0", fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              Average confidence is {averageConfidence.toFixed(2)} / 5. People feel sure. They are sure in different directions.
            </Text>

            <Hr style={{ borderColor: palette.rule, margin: "28px 0 24px" }} />

            <Heading
              style={{
                margin: "0 0 14px",
                fontWeight: 300,
                fontSize: 24,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
              }}
            >
              What we still need: 3 people.
            </Heading>
            <Text style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              The interesting layer is your friend graph. Globally, the crowd is split — but a clique of seven friends might be 6-1 the other way. We can&apos;t see that from totals.
            </Text>
            <Text style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              Send your personal link to 3 people. Once 3 of them answer, your /results page unlocks the full cohort comparison: your group&apos;s split vs everyone, your group&apos;s confidence vs everyone, and how the answer changes when responsibility is involved.
            </Text>

            <Section style={{ textAlign: "center" as const, margin: "32px 0 8px" }}>
              <Button
                href={shareUrl}
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
                Open my share link
              </Button>
            </Section>
            <Text
              style={{
                margin: "16px 0 0",
                color: palette.muted,
                fontFamily: monoStack,
                fontSize: 12,
                lineHeight: 1.5,
                wordBreak: "break-all" as const,
              }}
            >
              {shareUrl}
            </Text>
            <Text style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              Please send the link, not this email — the email has spoilers, the link keeps the question clean.
            </Text>

            <Hr style={{ borderColor: palette.rule, margin: "28px 0 14px" }} />
            <Text style={{ margin: 0, fontSize: 13, color: palette.muted }}>
              <Link href={caseStudyUrl} style={{ color: palette.muted, textDecoration: "underline" }}>
                Read the full case study →
              </Link>
            </Text>

            <Hr style={{ borderColor: palette.rule, margin: "20px 0 14px" }} />
            <Text style={{ margin: 0, fontSize: 12, color: palette.muted }}>
              You&apos;re receiving this one-time interim note because you confirmed your email after responding. Final results will still be sent when the study closes.
            </Text>
            <Text style={{ margin: "8px 0 0", fontSize: 12, color: palette.muted }}>
              <Link href={unsubscribeUrl} style={{ color: palette.muted, textDecoration: "underline" }}>
                Unsubscribe
              </Link>{" "}
              from all future Threshold Study emails.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function StatBlock({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <Section
      style={{
        backgroundColor: palette.accentSoft,
        border: `1px solid ${palette.rule}`,
        padding: small ? "12px 12px" : "20px 18px",
      }}
    >
      <Text
        style={{
          margin: 0,
          color: palette.muted,
          fontFamily: monoStack,
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          margin: small ? "6px 0 0" : "8px 0 0",
          fontFamily: fontStack,
          fontWeight: 300,
          fontSize: small ? 26 : 40,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          color: palette.accent,
        }}
      >
        {value}
      </Text>
    </Section>
  );
}
