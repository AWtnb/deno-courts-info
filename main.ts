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
 * 「裁判所」という文字列が現れるたびに切り出し処理を行う
 *
 * @param text - 裁判所名を含む文字列
 * @returns 抽出された裁判所名の配列
 */
const splitCourts = (text: string): string[] => {
  const found: string[] = [];
  let startPos = 0;

  while (startPos < text.length) {
    // 現在位置から「裁判所」を探す
    const courtEndPos = text.indexOf("裁判所", startPos);

    // 「裁判所」が見つからなければ終了
    if (courtEndPos === -1) {
      break;
    }

    // 「裁判所」の末尾位置（「所」の次の文字位置）
    const endPos = courtEndPos + 3;

    // 次の「裁判所」があるか確認
    const nextCourtPos = text.indexOf("裁判所", endPos);

    if (nextCourtPos !== -1) {
      // 次の「裁判所」がある場合、現在の「裁判所」までを切り出す
      found.push(text.substring(startPos, endPos));
      // 次の開始位置を現在の「裁判所」の末尾に設定
      startPos = endPos;
    } else {
      // 次の「裁判所」がない場合、残りすべてを取得
      found.push(text.substring(startPos));
      break;
    }
  }

  return found;
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

    let candidates: string[] = [];
    if (
      url.indexOf("/okayama/about/") != -1 ||
      url.indexOf("/matsue/about/") != -1
    ) {
      candidates = Array.from(document.querySelectorAll("tr > td:nth-child(1)"))
        .map(
          (el) => {
            return el.innerText.replace(/地図.+$/g, "");
          },
        );
    } else {
      candidates = Array.from(document.getElementsByTagName("a")).map(
        (atag) => {
          return atag.innerText.trim() ?? "";
        },
      );
    }

    const lines = candidates.filter((s) => {
      return s.endsWith("裁判所") || s.endsWith("支部") || s.endsWith("出張所");
    }).filter((s) => {
      return s.indexOf("内の") == -1 && s.indexOf("/") == -1;
    }).map((s) => {
      return s.replace(/(支部|出張所|・)/g, "$1\n").split("\n")
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
    }).filter((s) => {
      return 0 < s.length;
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
    console.log(
      `[${String(i + 1).padStart(2)}/${String(urls.length).padStart(2)}]`,
    );

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
    return href.indexOf("syozai") != -1 ||
      href.indexOf("ip/info/access/index.html") != -1;
  }).map((href) => {
    return href.replace("./../../", "https://www.courts.go.jp/");
  });
  return Array.from(new Set(hrefs));
};

const main = async () => {
  const urls = await getBaseUrls();
  const results = await scrapePages(urls, 1500);

  for (const result of results) {
    const filename = filenameFromURL(result.url);
    await saveAsFile(result.data, filename);
  }

  const allData = Array.from(new Set(results.flatMap((result) => result.data)));
  if (0 < allData.length) {
    const filename = `all_court_data_${getTimestamp()}.txt`;
    await saveAsFile(allData, filename);
  }
};

if (import.meta.main) {
  await main();
}
