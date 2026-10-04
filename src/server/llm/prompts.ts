// LLM に渡すプロンプト
import { MAX_PANELS } from "../../shared/layout.ts";
import type { Character, ContentRating, OutlinePage, Panel, Project, Style } from "../../shared/types.ts";
import { ADULT_MIN_AGE } from "../adult.ts";

export interface PlanInput {
  synopsis: string;
  pageCount: number;
  title: string;
  style: Style;
  rating: ContentRating;
}

export interface PageInput {
  project: Project;
  pageNumber: number;
  instruction: string;
}

export const SYSTEM = `あなたは日本の商業漫画の経験豊富なストーリー作家兼ネーム作家です。
ユーザーの概要をもとに、読みやすくテンポの良い漫画を構成します。
- セリフ・ナレーションは自然な日本語で、1つの吹き出しは最大30文字程度に収めます。
- 作画指示（imagePrompt / appearance）は画像生成AIに渡すため英語で書きます。
- 画像の中に文字・吹き出し・効果音の文字は描かせません（セリフは後から重ねます）。
- 出力は指定されたJSONのみとし、説明文やコードブロックは付けません。`;

function characterSheet(characters: Character[]) {
  return characters.map((c) => `- ${c.name}（${c.role}${c.age !== null ? `・${c.age}歳` : ""}）: ${c.appearance}`).join("\n");
}

// 成人向け（R18）作品のルール。登場人物は全員成人で、未成年を想起させる内容は書かない
const ADULT_RULES = `
# 成人向け（R18）作品のルール（必ず守る）
- 成人向けの作品として、概要に沿った性的な描写を含めてよい。
- 登場人物は人間以外も含めて全員${ADULT_MIN_AGE}歳以上の成人にする。age には${ADULT_MIN_AGE}以上の年齢を書く。
- 子ども・未成年・学生・学校・制服を登場させたり、想起させたりしない。幼い外見や体つきにしない。
- appearance と imagePrompt では、人物を "adult woman" / "adult man" のように成人として書き、girl / boy / young / petite / loli などの語は使わない。
`;

const ratingRules = (rating: ContentRating) => (rating === "adult" ? ADULT_RULES : "");

// このページに必要な最低コマ数（1場面＝1コマ以上）
export function minPanelsFor(outlinePage: OutlinePage): number {
  return Math.min(outlinePage.beats.length, MAX_PANELS);
}

// 実際に描いたコマを、セリフ付きで文章にする
function panelLines(panels: Panel[]) {
  return panels
    .map((p) => {
      const lines = p.bubbles.map((b) => `「${b.text}」${b.speaker ? `（${b.speaker}）` : "（ナレーション）"}`).join(" ");
      return `  - ${p.description}${lines ? ` ${lines}` : ""}`;
    })
    .join("\n");
}

export function planPrompt({ synopsis, pageCount, style, title, rating }: PlanInput): string {
  return `次の概要をもとに、全${pageCount}ページの漫画の構成を作ってください。概要が原作です。

# 概要（原作）
${synopsis}
${title ? `\n# タイトル案\n${title}\n` : ""}
# 絵柄
${style.label}

# 出力ルール
- facts: 最初に、概要に書かれている設定を箇条書きで書き出す（日本語・3〜8個）。登場人物の名前・性別・立場、起きている事件、目的、結末を必ず含める。概要にない情報は書かない。
- title: 作品タイトル（日本語）${title ? "。タイトル案があればそれを使う" : ""}
- logline: 作品の一行紹介（日本語）
- characters: 物語に登場する人物（脇役も含め最大6人）。age は年齢（整数）。
  appearance は画像生成AI向けの英語タグをカンマ区切りで書く（例: "1girl, young girl, short messy brown hair, big blue eyes, oversized witch hat, brown robe"）。
  性別・年齢・髪型・髪色・目・服装・特徴的な小物を、全コマで同じ見た目を保てるよう具体的に。人間以外は "black cat, no humans" のように種類をはっきり書く。
  画風・色づかい・線のタッチ（manga style, watercolor など）は書かない。
- pages: ちょうど${pageCount}件。page は1から連番。
  - summary: そのページで起きること（日本語・1〜2文）
  - beats: そのページで描く場面を起きる順に2〜5個（日本語）。1つの場面は1〜2コマで描ける具体的な出来事にする（例:「ルナが森で黒猫クロと出会う」）。
    summary に書いた出来事は必ず beats に含める。1ページに詰め込みすぎない（6場面以上になるなら次のページに回す）。

# 物語のつながり（重要）
- 全ページを通して一続きの物語にする。各ページの最初の場面は、前のページの最後の場面の直後から始める。
- ページの間で、描かれない出来事（説明なしの場所移動・時間経過・新事実）を作らない。必要なら場面として beats に入れる。
- 物語の目的や事件（何が起きて、何をしなければならないか）は、序盤のページで場面として描く。
- 起承転結を意識し、最終ページで物語がきちんと締まるよう配分する。

# 概要を守る（最重要）
- facts に書いた設定（人物の名前・性別・立場、事件、目的、結末）をそのまま使い、変えない。
- 概要にない大きな設定（記憶喪失、新しい敵、世界の秘密など）を勝手に足さない。脇役は物語に必要な最小限にする。
${ratingRules(rating)}
# もう一度、概要（原作）
${synopsis}`;
}

export function pagePrompt({ project, pageNumber, instruction }: PageInput): string {
  const { outline, characters } = project;
  const pageCount = outline.length;
  const outlineText = outline.map((p) => `${p.page}. ${p.summary}`).join("\n");
  const { beats } = outline[pageNumber - 1];
  const minPanels = minPanelsFor(outline[pageNumber - 1]);

  // 前ページの終わり（実際に描いたコマとセリフ）と、次ページの始まり
  const prevPage = project.pages?.[pageNumber - 2];
  const prev = prevPage?.panels?.length ? panelLines(prevPage.panels.slice(-2)) : null;
  const nextPage = project.pages?.[pageNumber];
  const next = nextPage?.panels?.length
    ? panelLines(nextPage.panels.slice(0, 1))
    : outline[pageNumber] ? `  - ${outline[pageNumber].beats[0]}` : null;

  const prevSection = prev
    ? `\n# 前のページ（${pageNumber - 1}ページ目）の最後のコマ\n${prev}\n→ このページはこの直後から始める。\n`
    : pageNumber === 1 ? "\n# このページは物語の最初のページ。読者が状況を理解できるよう導入する。\n" : "";
  const nextSection = next
    ? `\n# 次のページ（${pageNumber + 1}ページ目）の最初の場面\n${next}\n→ このページはその直前で終わり、自然に次へつながるようにする。\n`
    : "\n# このページは最終ページ。物語をきちんと締めくくる。\n";

  return `作品「${project.title}」（全${pageCount}ページ）の ${pageNumber} ページ目のネームを作ってください。

# 作品紹介
${project.logline}

# 原作の概要と、守るべき設定
${project.input?.synopsis || ""}
${(project.facts || []).map((f) => `- ${f}`).join("\n")}

# 登場人物
${characterSheet(characters)}

# 全体の構成
${outlineText}
${prevSection}
# このページ（${pageNumber}ページ目）で描く場面（すべてを、この順番で描く）
${beats.map((b, i) => `${i + 1}. ${b}`).join("\n")}
${nextSection}${instruction ? `\n# 作り直しの要望（最優先で反映）\n${instruction}\n` : ""}
# 出力ルール
- 上の場面をすべて、順番通りにコマにする。1つの場面に1コマ以上を使い、場面を省略・統合しない。コマ数は${minPanels}〜${MAX_PANELS}。
- panels は読む順。コマの配置はプログラムが size / shot / intensity から自動で組む。
- description: コマの内容（日本語・1文）
- size: コマの大きさ。メリハリをつけ、全部同じ大きさにしない。
  - splash: ページの決めゴマ（物語の山場・感情の爆発・大事な登場）。1ページに最大1つ。
  - large: 見せ場・重要な動き。1ページに1〜2つ。
  - medium: 通常のコマ。
  - small: 会話のやりとり、表情のアップ、細かい動作。
- shot: wide（全身・背景・状況説明）/ medium（上半身・二人の会話）/ closeup（顔や手元のアップ）
- intensity: calm（日常・静か）/ tense（緊張・不安）/ action（戦い・驚き・激しい動き）。緊迫した場面では枠が斜めになる。
- characters: そのコマに描かれる登場人物名（登場人物リストの名前と完全一致）。いなければ空配列。
- imagePrompt: 英語の作画指示。描く内容だけを書く：構図、人物の表情とポーズ、動作、背景、時間帯。
  人物は名前ではなく見た目で描写する。画風・色・線のタッチ・画材（manga style, cinematic, watercolor, colorful, black and white など）は書かない（絵柄は全コマ共通で別に指定する）。文字は含めない。
- bubbles: 1コマに0〜3個。絵だけでは伝わらない情報（誰が何を知ったか・何を決めたか・場所や時間の変化）は、必ずセリフかナレーションで読者に伝える。
  ページ全体で4個以上を目安にする（無言のコマは見せ場だけ）。
  type は speech（会話）/ thought（心の声）/ shout（叫び）/ narration（ナレーション）。
  position はコマ内の配置で、話者の頭上付近になるよう選ぶ。narration の speaker は空文字でよい。
${ratingRules(project.rating)}`;
}
