import { DOMParser } from "@b-fuze/deno-dom";

/**
 * 指定されたミリ秒だけ実行を遅延させる
 * @param ms 遅延させるミリ秒
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 文字列内の裁判所名を抽出し配列として返す
 *
 * 「裁判所」という文字列が現れるたびに、そこまでを1つの裁判所名として切り出す
 * 地方裁判所、家庭裁判所、簡易裁判所などの順序や組み合わせは不問
 *
 * @param text - 裁判所名を含む文字列
 * @returns 抽出された裁判所名の配列
 *
 * @example
 * ```
 * const result = splitCourts('釧路地方裁判所釧路家庭裁判所釧路簡易裁判所');
 * // ['釧路地方裁判所', '釧路家庭裁判所', '釧路簡易裁判所']
 * ```
 */
const splitCourts = (text: string): string[] => {
  const results: string[] = [];
  let currentIndex = 0;

  while (0 <= currentIndex && currentIndex < text.length) {
    const nextCourtEnd = text.indexOf("裁判所", currentIndex);

    if (nextCourtEnd === -1) {
      break;
    }

    // 「裁判所」を含めた文字列を取得
    const courtName = text.substring(currentIndex, nextCourtEnd + 3);
    results.push(courtName);

    // 次の開始位置を設定
    currentIndex = nextCourtEnd + 3;
  }
  if (results.length < 2) {
    return [text];
  }
  return results;
};

/**
 * 指定されたURLからウェブページをスクレイピングする
 * @param url スクレイピングするウェブページのURL
 */
const scrapePage = async (url: string): Promise<string[]> => {
  try {
    console.log(`${url} からデータを取得中...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();

    const document = new DOMParser().parseFromString(html, "text/html");
    if (!document) {
      throw new Error("Failed to parse HTML.");
    }

    const lines: string[] = Array.from(document.getElementsByTagName("a")).map(
      (atag) => {
        const s = atag.getAttribute("title") ?? "";
        if (s != "") {
          return s;
        }
        return atag.innerText.trim() ?? "";
      },
    ).filter((s) => {
      return s.endsWith("裁判所") || s.endsWith("支部");
    }).filter((s) => {
      return s.indexOf("内の") == -1 && s.indexOf("/") == -1;
    }).map((s) => {
      return s.replace(/支部/g, "支部\n").replace(/出張所/g, "出張所\n")
        .replace(/・/g, "\n").split("\n")
        .map((line) => {
          return line.trim();
        })
        .filter((line) => {
          return 0 < line.trim().length;
        });
    }).flat().map((s) => {
      return splitCourts(s);
    }).flat().map((s) => {
      return s.trim().replace(/[，．･・]|\s/g, "");
    });
    const uniq = new Set(lines);
    const sorted = [...uniq].sort();
    return [...sorted].sort((a, b) => a.length - b.length);
  } catch (error) {
    throw new Error(`Error in ${url}: ${error}`);
  }
};

interface ScrapeResult {
  url: string;
  data: string[];
}

/**
 * 複数のURLをスクレイピングする（間隔を空けて実行）
 * @param urls スクレイピングするURLの配列
 * @param delayMs リクエスト間の遅延（ミリ秒）
 */
const scrapePages = async (
  urls: string[],
  delayMs: number,
): Promise<ScrapeResult[]> => {
  const results: ScrapeResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const result = await scrapePage(url);
      console.log(result);
      results.push({
        url,
        data: result,
      });
    } catch (error) {
      console.error(error);
    }

    if (i < urls.length - 1) {
      console.log(
        `[${String(i + 1).padStart(3)}/${
          String(urls.length).padStart(3)
        }] 次のリクエストまで ${delayMs}ms 待機中...`,
      );
      await sleep(delayMs);
    }
  }

  return results;
};

/**
 * スクレイピングデータをtxtファイルに書き出す
 * @param data 書き出すデータ
 * @param filename ファイル名
 */
const saveAsFile = async (
  data: string[],
  filename: string,
): Promise<void> => {
  try {
    const content = data.join("\n");
    await Deno.writeTextFile(filename, content);
  } catch (error) {
    console.error(`ファイルの書き込み中にエラーが発生しました: ${error}`);
    throw error;
  }
};

/**
 * 現在時刻を基にしたタイムスタンプ文字列を生成する
 * ISO形式の日時から、ファイル名に使用できる形式に変換する
 *
 * @returns ファイル名に適した形式のタイムスタンプ文字列
 *          例: "2023-10-15T12-34-56-789Z"
 */
const getTimestamp = (): string => {
  return new Date().toISOString().replace(/[:.]/g, "-");
};

/**
 * URLからファイル名部分を抽出する
 * @param url URL
 * @returns ファイル名（拡張子なし）
 */
const filenameFromURL = (url: string): string => {
  const basename = url.replace("https://www.courts.go.jp/", "").split("/")[0];
  return `${getTimestamp()}_${basename}.txt`;
};

const getBaseUrls = async (): Promise<string[]> => {
  const url = "https://www.courts.go.jp/courthouse/map_tel/index.html";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const html = await response.text();

  const document = new DOMParser().parseFromString(html, "text/html");
  if (!document) {
    throw new Error("Failed to parse HTML.");
  }
  const hrefs = Array.from(document.getElementsByTagName("a")).map((atag) => {
    const href = atag.getAttribute("href");
    return href;
  }).filter((href) => {
    return href !== null;
  }).filter((href) => {
    return href.indexOf("syozai/index.html") != -1 ||
      href.indexOf("ip/info/access/index.html") != -1;
  }).map((href) => {
    return href.replace("./../../", "https://www.courts.go.jp/");
  });
  return Array.from(new Set(hrefs));
};

const main = async () => {
  const urls = await getBaseUrls();
  const results = await scrapePages(urls, 3000);

  for (const result of results) {
    const filename = filenameFromURL(result.url);
    await saveAsFile(result.data, filename);
  }

  const allData = results.flatMap((result) => result.data);
  if (0 < allData.length) {
    const filename = `all_court_data_${getTimestamp()}.txt`;
    await saveAsFile(allData, filename);
  }
};

if (import.meta.main) {
  await main();
}
