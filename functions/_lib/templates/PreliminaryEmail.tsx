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

export type FrameSwingRow = {
  /** Display label (e.g. 'Original', 'Spare prose', 'Individual payoff'). */
  label: string;
  /** Personal-choice threshold% inside this frame cell, 0–100. */
  pct: number;
  /** Sample size for this cell. */
  n: number;
};

export type PreliminaryEmailProps = {
  totalResponses: number;
  personalChoiceThresholdPct: number;
  dependentRecommendationThresholdPct: number;
  averageConfidence: number;
  /** Per-mechanism-frame personal threshold%, ordered widest to narrowest
      so the chart leads with the strongest framing first. Empty array is
      acceptable — the chart simply won’t render. */
  frameSwing: FrameSwingRow[];
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
  dependentRecommendationThresholdPct,
  frameSwing,
  averageConfidence,
  shareUrl,
  caseStudyUrl,
  unsubscribeUrl,
}: PreliminaryEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Preliminary results from {totalResponses.toLocaleString()} respondents. The split is one percentage point from a coin flip — but the wording moves the answer thirty points. Read the breakdown.
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
              Preliminary results · mid-study drop
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
              The preliminary results are in.
            </Heading>
            <Text style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              {totalResponses.toLocaleString()} people answered the same question.
              Globally the split is almost a coin flip — but the average hides
              the most interesting thing in the data: how much the wording
              itself moved the answer. We just published the full breakdown,
              with charts, at{" "}
              <Link
                href={caseStudyUrl}
                style={{
                  color: palette.accent,
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                /case-study →
              </Link>
              .
            </Text>
            <Text
              style={{
                margin: "14px 0 0",
                fontSize: 17,
                lineHeight: 1.6,
                color: palette.ink,
              }}
            >
              <strong style={{ fontWeight: 600 }}>And we just need 3 more from you.</strong>{" "}
              Once three friends answer through your link, your /results
              unlocks the cohort layer below.
            </Text>

            {/* Top share CTA — button + copy-pasteable URL block. Mirrors
                the bottom CTA so a reader who’s already in can act before
                scrolling through the stats and case-study card. */}
            <Section style={{ textAlign: "center" as const, margin: "20px 0 10px" }}>
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
                Send your link →
              </Button>
            </Section>
            <Section
              style={{
                margin: "0 0 4px",
                padding: "10px 14px",
                backgroundColor: palette.page,
                border: `1px solid ${palette.rule}`,
                borderRadius: 3,
              }}
            >
              <Text
                style={{
                  margin: 0,
                  color: palette.ink,
                  fontFamily: monoStack,
                  fontSize: 13,
                  lineHeight: 1.45,
                  wordBreak: "break-all" as const,
                }}
              >
                {shareUrl}
              </Text>
            </Section>
            <Text
              style={{
                margin: "6px 0 0",
                color: palette.muted,
                fontFamily: monoStack,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Copy — paste — send
            </Text>

            {/* Headline finding: the wording moves the answer ~30 points.
                Replaces the four-stat strip — same email real estate now
                tells one strong, surprising story instead of four numbers
                of similar magnitude. */}
            <Section style={{ margin: "28px 0 0" }}>
              <Text
                style={{
                  margin: 0,
                  color: palette.accent,
                  fontFamily: monoStack,
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                The biggest finding so far
              </Text>
              <Heading
                style={{
                  margin: "6px 0 14px",
                  fontWeight: 300,
                  fontSize: 24,
                  lineHeight: 1.18,
                  letterSpacing: "-0.018em",
                  color: palette.ink,
                }}
              >
                Same question. Four wordings. {frameSpread(frameSwing)} points apart.
              </Heading>
              <FrameSwingChart frames={frameSwing} />
              <Text
                style={{
                  margin: "10px 0 0",
                  color: palette.muted,
                  fontFamily: monoStack,
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  lineHeight: 1.5,
                }}
              >
                Each bar = % of respondents who picked the group-dependent
                button when the prompt was framed that way. Same threshold
                rule, same labels, same outcomes — only the framing sentence
                changes.
              </Text>
            </Section>

            <Section
              style={{
                margin: "24px 0 0",
                padding: "14px 18px",
                backgroundColor: palette.accentSoft,
                borderLeft: `3px solid ${palette.accent}`,
              }}
            >
              <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: palette.ink }}>
                <strong style={{ fontWeight: 600 }}>Confidence is {averageConfidence.toFixed(2)} / 5.</strong>{" "}
                People feel sure. They’re sure in different directions — and the
                same person gets more cautious by{" "}
                <strong style={{ fontWeight: 600 }}>
                  {Math.round(
                    Math.abs(personalChoiceThresholdPct - dependentRecommendationThresholdPct) * 10,
                  ) / 10}{" "}
                  points
                </strong>{" "}
                when the question is for someone in their care.
              </Text>
            </Section>

            <Hr style={{ borderColor: palette.rule, margin: "32px 0 24px" }} />

            {/* Case-study CTA block — prominent secondary action so this
                email pulls double duty: drives shares AND drives reads of the
                published analysis. */}
            <Section
              style={{
                margin: "0 0 8px",
                padding: "22px 22px",
                backgroundColor: palette.panel,
                border: `1px solid ${palette.rule}`,
                borderLeft: `3px solid ${palette.accent}`,
              }}
            >
              <Text
                style={{
                  margin: 0,
                  color: palette.accent,
                  fontFamily: monoStack,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                We just published the breakdown
              </Text>
              <Heading
                style={{
                  margin: "8px 0 12px",
                  fontWeight: 300,
                  fontSize: 22,
                  lineHeight: 1.2,
                  letterSpacing: "-0.015em",
                  color: palette.ink,
                }}
              >
                How four wordings made the same question feel like four
                different ones.
              </Heading>
              <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: palette.inkSoft }}>
                Same threshold rule, four mechanism framings, four button
                labelings. The answer swings ~30 percentage points end to end.
                Plus the responsibility shift, the prediction-vs-reality gap,
                the label-condition variance. Full analysis with charts on the
                case study page.
              </Text>
              <Section style={{ margin: "18px 0 0" }}>
                <Button
                  href={caseStudyUrl}
                  style={{
                    backgroundColor: palette.panel,
                    color: palette.accent,
                    fontFamily: monoStack,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    padding: "12px 18px",
                    textDecoration: "none",
                    border: `1px solid ${palette.accent}`,
                  }}
                >
                  Read the case study →
                </Button>
              </Section>
            </Section>

            <Hr style={{ borderColor: palette.rule, margin: "28px 0 24px" }} />

            <Text
              style={{
                margin: 0,
                color: palette.accent,
                fontFamily: monoStack,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Invite 3 — unlock yours
            </Text>
            <Heading
              style={{
                margin: "8px 0 14px",
                fontWeight: 300,
                fontSize: 28,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
              }}
            >
              Send your link to 3 people.
            </Heading>
            <Text style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              Three is the threshold. Once three friends answer through your
              link, your /results unlocks the cohort view: your crowd’s split
              vs the world, your crowd’s confidence vs the world, and how the
              answer drifts as the chain widens.
            </Text>
            <Text style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.6, color: palette.inkSoft }}>
              <strong style={{ fontWeight: 600 }}>Send the link, not this email.</strong>{" "}
              The email has spoilers; the link keeps the question clean.
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
                Send your link →
              </Button>
            </Section>
            {/* URL displayed in a code-block style so it’s obvious this is
                a copy-pasteable string, not just secondary footer text. */}
            <Section
              style={{
                margin: "12px 0 0",
                padding: "10px 14px",
                backgroundColor: palette.page,
                border: `1px solid ${palette.rule}`,
                borderRadius: 3,
              }}
            >
              <Text
                style={{
                  margin: 0,
                  color: palette.ink,
                  fontFamily: monoStack,
                  fontSize: 13,
                  lineHeight: 1.45,
                  wordBreak: "break-all" as const,
                }}
              >
                {shareUrl}
              </Text>
            </Section>
            <Text
              style={{
                margin: "6px 0 0",
                color: palette.muted,
                fontFamily: monoStack,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Copy — paste — send
            </Text>



            <Hr style={{ borderColor: palette.rule, margin: "20px 0 14px" }} />
            <Text style={{ margin: 0, fontSize: 12, color: palette.muted }}>
              You’re getting this one-time interim note because you confirmed
              your email after responding. Final results land in your inbox
              when the study closes.
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

/**
 * Spread of personal threshold% across all frames — used in the chart
 * heading. Returns a string with at most one decimal place. Renders “—”
 * if there’s less than two cells of data.
 */
function frameSpread(frames: FrameSwingRow[]): string {
  const pcts = frames.map((f) => f.pct).filter((p) => Number.isFinite(p));
  if (pcts.length < 2) return "—";
  const spread = Math.max(...pcts) - Math.min(...pcts);
  return (Math.round(spread * 10) / 10).toString();
}

/**
 * FrameSwingChart — email-friendly horizontal bar chart of % personal-
 * choice threshold per mechanism frame. Each row is a Row of three
 * Columns: label, bar, value. The bar itself is two stacked Sections
 * sized by % so it renders identically in Outlook (which strips most
 * CSS) and Gmail (which keeps inline styles).
 *
 * Renders nothing when frames is empty (e.g. on first deploy before
 * any responses by frame).
 */
function FrameSwingChart({ frames }: { frames: FrameSwingRow[] }) {
  if (frames.length === 0) return null;
  return (
    <Section
      style={{
        backgroundColor: palette.panel,
        border: `1px solid ${palette.rule}`,
        padding: "14px 16px",
      }}
    >
      {frames.map((row, i) => (
        <Section
          key={row.label}
          style={{
            margin: i === 0 ? "0" : "10px 0 0",
          }}
        >
          <Row>
            <Column
              style={{
                width: "32%",
                paddingRight: 10,
                verticalAlign: "middle" as const,
              }}
            >
              <Text
                style={{
                  margin: 0,
                  color: palette.ink,
                  fontFamily: monoStack,
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  lineHeight: 1.3,
                }}
              >
                {row.label}
                <span
                  style={{
                    color: palette.muted,
                    fontSize: 10,
                    marginLeft: 6,
                  }}
                >
                  n={row.n}
                </span>
              </Text>
            </Column>
            <Column style={{ width: "54%", verticalAlign: "middle" as const }}>
              {/* Two-segment bar. Filled width = pct%. Empty width =
                  100-pct%. Heights stay identical because both Sections
                  use the same fixed height. */}
              <Section
                style={{
                  border: `1px solid ${palette.rule}`,
                  backgroundColor: palette.accentSoft,
                  height: 18,
                  lineHeight: "18px",
                }}
              >
                <Row>
                  <Column
                    style={{
                      width: `${row.pct}%`,
                      backgroundColor: palette.accent,
                      height: 18,
                    }}
                  />
                  <Column
                    style={{
                      width: `${100 - row.pct}%`,
                      height: 18,
                    }}
                  />
                </Row>
              </Section>
            </Column>
            <Column
              style={{
                width: "14%",
                paddingLeft: 10,
                verticalAlign: "middle" as const,
                textAlign: "right" as const,
              }}
            >
              <Text
                style={{
                  margin: 0,
                  color: palette.accent,
                  fontFamily: fontStack,
                  fontWeight: 500,
                  fontSize: 18,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {Math.round(row.pct * 10) / 10}%
              </Text>
            </Column>
          </Row>
        </Section>
      ))}
    </Section>
  );
}

