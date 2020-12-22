import puppeteer, { LaunchOptions } from "puppeteer";
import { Page } from "puppeteer/lib/cjs/puppeteer/common/Page";
import { Readable, ReadableOptions } from "stream";
import path from "path";
import { Browser } from "puppeteer/lib/cjs/puppeteer/common/Browser";

export class Stream extends Readable {
	constructor(private page: Page, options?: ReadableOptions) {
		super(options);
	}

	_read() {}

	destroy() {
		super.destroy();
		// TODO: do not destory page just stop recording
		// await page.evaluate((filename) => {
		// 	window.postMessage({ type: "REC_STOP" }, "*");
		// }, exportname);
		return this.page.close();
	}
}

declare module "puppeteer" {
	interface Page {
		index: number;
		getStream(opts: getStreamOptions): Promise<Stream>;
	}
}

const oldLaunch = puppeteer.launch;
// @ts-ignore
puppeteer.launch = async function (opts: LaunchOptions) {
	if (!opts) opts = {};
	if (!opts.args) opts.args = [];

	const extensionPath = path.join(__dirname, "..", "extension");
	const extensionId = "jjndjgheafjngoipoacpjgeicjeomjli";
	let loadExtension = false;
	let loadExtensionExcept = false;
	let whitelisted = false;

	opts.args.map((x) => {
		if (x.includes("--load-extension=")) {
			loadExtension = true;
			return x + "," + extensionPath;
		} else if (x.includes("--disable-extensions-except=")) {
			loadExtensionExcept = true;
			return x + "," + extensionPath;
		} else if (x.includes("--whitelisted-extension-id")) {
			whitelisted = true;
			return x + "," + extensionId;
		}

		return x;
	});

	if (!loadExtension) opts.args.push("--load-extension=" + extensionPath);
	if (!loadExtensionExcept) opts.args.push("--disable-extensions-except=" + extensionPath);
	if (!whitelisted) opts.args.push("--whitelisted-extension-id=" + extensionId);
	if (opts.defaultViewport?.width && opts.defaultViewport?.height)
		opts.args.push(`--window-size=${opts.defaultViewport?.width}x${opts.defaultViewport?.height}`);

	opts.headless = false;

	const browser: Browser = await oldLaunch.call(this, opts);
	// @ts-ignore
	browser.encoders = new Map();

	const targets = await browser.targets();
	const extensionTarget = targets.find(
		// @ts-ignore
		(target) => target.type() === "background_page" && target._targetInfo.title === "Video Capture"
	);
	// @ts-ignore
	browser.videoCaptureExtension = await extensionTarget.page();

	// @ts-ignore
	await browser.videoCaptureExtension.exposeFunction("sendData", (opts: any) => {
		const data = Buffer.from(str2ab(opts.data));
		// @ts-ignore
		browser.encoders.get(opts.id).push(data);
	});

	return browser;
};

const oldNewPage = Browser.prototype.newPage;
Browser.prototype.newPage = async function (this: Browser) {
	const page = await oldNewPage.call(this);
	const pages = await this.pages();
	page.index = pages.length - 1;
	return page;
};

export type BrowserMimeType =
	| "audio/webm"
	| "audio/webm;codecs=opus"
	| "audio/opus"
	| "audio/aac"
	| "audio/ogg"
	| "audio/mp3"
	| "audio/pcm"
	| "audio/wav"
	| "audio/vorbis"
	| "video/webm"
	| "video/mp4"
	| "image/gif";

export interface getStreamOptions {
	audio: boolean;
	video: boolean;
	mimeType?: BrowserMimeType;
	audioBitsPerSecond?: number;
	videoBitsPerSecond?: number;
	bitsPerSecond?: number;
	frameSize?: number;
}

// @ts-ignore
Page.prototype.getStream = async function (this: Page, opts: getStreamOptions) {
	const encoder = new Stream(this);
	if (!opts.audio && !opts.video) throw new Error("At least audio or video must be true");
	if (!opts.mimeType) {
		if (opts.video) opts.mimeType = "video/webm";
		else if (opts.audio) opts.mimeType = "audio/webm";
	}
	if (!opts.frameSize) opts.frameSize = 20;

	await this.bringToFront();
	// @ts-ignore

	await (<Page>this.browser().videoCaptureExtension).evaluate(
		(settings) => {
			// @ts-ignore
			START_RECORDING(settings);
		},
		// @ts-ignore
		{ ...opts, index: this.index }
	);

	// @ts-ignore
	this.browser().encoders.set(this.index, encoder);

	return encoder;
};

function str2ab(str: any) {
	// Convert a UTF-8 String to an ArrayBuffer

	var buf = new ArrayBuffer(str.length); // 1 byte for each char
	var bufView = new Uint8Array(buf);

	for (var i = 0, strLen = str.length; i < strLen; i++) {
		bufView[i] = str.charCodeAt(i);
	}
	return buf;
}
