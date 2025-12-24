import { DOMParser } from "@b-fuze/deno-dom";

/**
 * 指定されたミリ秒だけ実行を遅延させる
 * @param ms 遅延させるミリ秒
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

interface CourtInfo {
  name: string;
  place: string;
  tel: string;
}

/**
 * 指定されたURLからウェブページをスクレイピングする
 * @param url スクレイピングするウェブページのURL
 */
const scrapePage = async (url: string): Promise<CourtInfo[]> => {
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

    return Array.from(
      document.querySelectorAll("tbody tr:not(tr:nth-child(1))"),
    ).map((tr) => {
      const name = tr.querySelector("th")!.textContent.replace(
        /\s+/g,
        " ",
      ).trim();
      const tds = Array.from(tr.querySelectorAll("td")).map((el) => {
        return el.textContent.trim();
      });
      return { name: name, place: tds[0], tel: tds[1] };
    });
  } catch (error) {
    throw new Error(`Error in ${url}: ${error}`);
  }
};

interface ScrapeResult {
  url: string;
  data: CourtInfo[];
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
      results.push({
        url,
        data: result,
      });
    } catch (error) {
      console.error(error);
    }

    if (i < urls.length - 1) {
      console.log(`次のリクエストまで ${delayMs}ms 待機中...`);
      await sleep(delayMs);
    }
  }

  return results;
};

/**
 * スクレイピングデータをCSVファイルに書き出す
 * @param data 書き出すデータ
 * @param filename ファイル名
 */
const saveAsCSV = async (
  data: CourtInfo[],
  filename: string,
): Promise<void> => {
  try {
    const header = "裁判所名,所在地,電話番号\n";

    const csvContent = data.map((court) =>
      `"${court.name}","${court.place}","${court.tel}"`
    ).join("\n");

    // ヘッダーとコンテンツを結合
    const fullContent = header + csvContent;

    await Deno.writeTextFile(filename, fullContent);
  } catch (error) {
    console.error(`CSVファイルの書き込み中にエラーが発生しました: ${error}`);
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
  const parts = url.split("/");
  const lastPart = parts[parts.length - 1];
  const basename = lastPart.split(".")[0];
  return `court_data_${basename}_${getTimestamp()}.csv`;
};

const main = async () => {
  const urls = [
    "sapporo.html",
    "sendai.html",
    "tokyo.html",
    "nagoya.html",
    "osaka.html",
    "hiroshima.html",
    "takamatsu.html",
    "fukuoka.html",
  ].map((s) => {
    return `https://www.choutei.jp/courts/courts_family/${s}`;
  });

  const results = await scrapePages(urls, 3000);

  for (const result of results) {
    const filename = filenameFromURL(result.url);
    await saveAsCSV(result.data, filename);
  }

  const allData = results.flatMap((result) => result.data);
  if (0 < allData.length) {
    const filename = `all_court_data_${getTimestamp()}.csv`;
    await saveAsCSV(allData, filename);
  }
};

if (import.meta.main) {
  await main();
}
