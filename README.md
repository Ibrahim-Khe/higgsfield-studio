# Higgsfield Studio

**A simple desktop studio for making AI video clips with the [Higgsfield API](https://docs.higgsfield.ai), with the exact price shown before you click Generate.**

Pick a mode (text → video, image → video, or extend a clip), choose from ~60 models (Seedance, Kling, Wan, MiniMax, PixVerse, LTX, Grok…), adjust the settings, and see what the clip will cost as you change them. Everything runs on your own computer. Your API key never leaves it except to talk to Higgsfield.

> Not affiliated with Higgsfield. You need your own Higgsfield API account; generations are billed to it.

---

## Contents

1. [What you can do](#what-you-can-do)
2. [What you need](#what-you-need)
3. [Install](#install)
4. [Get your API key](#get-your-api-key)
5. [Start the studio](#start-the-studio)
6. [How to use it](#how-to-use-it)
7. [Understanding the price](#understanding-the-price)
8. [Balance and adding funds](#balance-and-adding-funds)
9. [Keeping models and prices up to date](#keeping-models-and-prices-up-to-date)
10. [Troubleshooting](#troubleshooting)
11. [FAQ](#faq)
12. [For developers](#for-developers)

---

## What you can do

| | |
|---|---|
| 🎬 **Text to Video** | Describe a shot and get a clip. |
| 🖼️ **Image to Video** | Animate a picture. Set a start frame, an optional end frame, or reference images (characters, products, style), depending on the model. |
| ➡️ **Extend Video** | Continue a clip you made or one you upload. **Native extend** (Seedance 2.5) continues the actual video. **From last frame** takes the final frame and animates it with any image-to-video model. |
| 💲 **Live cost preview** | The price per clip updates as you change duration, resolution, sound, quality tier and so on. Each option also shows how much it adds or saves, e.g. `1080p +$1.32`. |
| ⚖️ **Compare models** | "Same shot, other models" prices your current settings on every model, cheapest first. Click one to switch. |
| 👛 **Balance tracker** | Enter your balance once. The studio subtracts each clip and warns you before you overspend. |
| 📚 **Clip library** | Watch progress, preview on hover, download, extend, or reuse a clip's settings. |

## What you need

- A Mac, Windows or Linux computer
- **[Node.js](https://nodejs.org) version 18 or newer.** Download the "LTS" version and install it like any other app. To check, open a terminal and run `node -v`.
- A **Higgsfield API account** with some balance: [open.higgsfield.ai](https://open.higgsfield.ai)

Nothing else. The studio has no extra packages to install.

## Install

Open a terminal (on Mac: the *Terminal* app) and run:

```bash
git clone https://github.com/Ibrahim-Khe/higgsfield-studio.git
cd higgsfield-studio
```

No git? On the GitHub page click **Code → Download ZIP**, unzip it, and open a terminal in that folder.

## Get your API key

1. Sign in at [open.higgsfield.ai](https://open.higgsfield.ai) (the API console).
2. Go to **API keys** and create a key.
3. Copy it right away, because it's shown only once. It looks like this:

   ```
   1a2b3c4d-xxxx-xxxx-xxxx-xxxxxxxxxxxx:9f8e7d6cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   └──────────── key ID ────────────┘ └──────────────────────── key secret ─────────────────────┘
   ```

   The part before the colon is the **key ID** and the part after it is the **secret**. You can paste the whole thing in one go.

## Start the studio

In the project folder:

```bash
npm start
```

You'll see `Higgsfield Studio → http://localhost:5177`. Open that address in your browser.

On first launch the studio asks for your API key. Paste the whole `id:secret` string into **Key ID** and click **Save key**. The key is stored in a file called `.env` inside the project folder and is only read by the studio's local server.

To stop the studio, press `Ctrl + C` in the terminal. Next time, just `cd` into the folder and run `npm start` again.

## How to use it

### 1. Pick a mode
Use the three big buttons at the top: **Text to Video**, **Image to Video** or **Extend Video**.

### 2. Pick a model
Click the model card or **Browse all models**. You can search, filter (audio, 20s+, 1080p+, under $0.05/s, end frame) and sort by price. Many models have tiers such as *Standard / Pro / 4K / Turbo*. They appear as chips under the model, each with its price per second.

Not sure which one? The **Same shot, other models** list on the right shows what your exact settings would cost everywhere.

### 3. Add your inputs
- **Prompt:** describe the subject, action, camera movement, lighting and mood. **Use example** fills in a sample prompt for the model.
- **Images** (Image to Video): drag and drop, click, or paste (`Cmd/Ctrl + V`).
- **Clip** (Extend Video): pick one of your clips or upload an MP4.

### 4. Adjust the settings
Duration, resolution, aspect ratio, sound and so on. Rarely needed options are under **Advanced**. Options that change the price show the difference right on the button.

### 5. Generate
Check the price on the right and click **Generate · $X.XX** (or press `Cmd/Ctrl + Enter`). With **Variations** you can make up to 4 versions at once.

Your clip appears under **Your clips**. It shows *Queued* and then *Rendering* with a timer, and takes about 1–5 minutes depending on the model. When it's ready:
- **Save** downloads the MP4. Higgsfield keeps files for at least 7 days, so download the ones you want to keep.
- **Extend** continues the clip in Extend mode.
- **Reuse** loads the clip's model, settings and prompt so you can tweak and regenerate.

## Understanding the price

The big number is the cost of the clip (or of all variations). The badge tells you where the number comes from:

| Badge | Meaning |
|---|---|
| 🟣 **Live** | Quoted by Higgsfield for your account at that moment. This is what you'll be charged. |
| 🟢 **Exact** | Worked out from Higgsfield's published pricing formula, or from rates measured from Higgsfield's quotes. |
| 🟠 **Estimate** | A best guess from Higgsfield's published price range. Rare. |

Other things you'll see:
- **Crossed-out price:** the regular price. Many models have a launch discount (e.g. −45% on Kling) until a set date. The toggle **Launch pricing** in the top bar switches between discounted and regular prices.
- **Credits:** Higgsfield bills in credits, about 16 credits per $1. The credit amount is shown under the price.
- **Extend (native):** you pay for the source clip's seconds plus the new seconds.
- **Failed or blocked clips are free.** Higgsfield refunds them.

## Balance and adding funds

Higgsfield's API doesn't report your balance, so:

1. Click **Balance** in the top bar.
2. Enter the amount shown on your [Higgsfield billing page](https://open.higgsfield.ai/billing).
3. The studio subtracts every clip you make from it. If a generation would cost more than what's left, you get a warning.

The balance only counts clips made in this studio. If you also use Higgsfield elsewhere, re-enter your balance now and then.

**+ Add funds** opens Higgsfield's billing page. Payments happen on Higgsfield's site; the studio never handles card details.

## Keeping models and prices up to date

Higgsfield adds models and changes prices from time to time. Two commands keep the studio current:

```bash
npm run update-catalog   # refresh the list of models and their settings
npm run calibrate        # refresh exact prices (free, needs your API key)
```

Neither one generates anything or costs money.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm error enoent Could not read package.json` | You're not in the project folder. Run `cd` to it first, e.g. `cd ~/Desktop/Projects/higgsfield-studio`. |
| `node: command not found` | Install Node.js from [nodejs.org](https://nodejs.org), then open a new terminal. |
| `EADDRINUSE: address already in use :::5177` | The studio is already running in another terminal. Use that one, or pick another port: `PORT=5180 npm start`. |
| The red dot says **Add API key** | Click it and paste your key. |
| *Unauthorized* / `401` | The key is wrong or was deleted. Create a new one and paste it again. |
| *Insufficient balance* or similar | Top up via **+ Add funds**. |
| Clip shows **Blocked** | Higgsfield's content filter rejected the prompt or image. Rephrase it. You're not charged. |
| Clip shows **Failed** | Usually a setting combination the model doesn't support. Try other settings. You're not charged. |
| Too many clips waiting in queue | New accounts can run 2 generations at a time. Adding $25+ raises it to 10. |

## FAQ

**Is my API key safe?**
It's stored in `.env` in the project folder and used only by the studio's server on your computer. The browser page never receives it, and `.env` is excluded from git so it's never uploaded.

**Where are my clips stored?**
On Higgsfield's servers for at least 7 days. The studio keeps a list of them in `data/jobs.json`. Use **Save** to keep files permanently.

**Can other people on my network open it?**
No. The server only listens on your own computer (`localhost`).

**Does it cost anything besides Higgsfield?**
No.

---

## For developers

```
server.mjs                    Local server: serves the UI and proxies the Higgsfield API
                              (generate, status, cancel, upload, estimate, media, balance)
public/index.html             Page layout
public/app.js                 UI logic: modes, model picker, schema-driven settings, library
public/app.css                Styles (dark and light)
public/pricing.js             Cost engine: published formulas + measured rates + fallbacks
public/catalog.json           Model catalog (generated by scripts/update-catalog.mjs)
public/rates.json             Measured rates (generated by scripts/calibrate-prices.mjs)
scripts/update-catalog.mjs    Crawls open.higgsfield.ai model pages → catalog.json
scripts/calibrate-prices.mjs  Queries POST /estimate/<model> → rates.json
data/                         Local clip history and balance (not committed)
.env                          Your API key (not committed; see .env.example)
```

- No dependencies. Plain Node (≥18) and vanilla JS modules.
- Higgsfield API basics: `POST https://api.higgsfield.ai/<model-path>` with header `Authorization: Key <id>:<secret>` returns a `request_id`. Poll `GET /requests/<id>/status` until `completed`; the result is at `video.url`. Docs: [docs.higgsfield.ai](https://docs.higgsfield.ai).
- To add a new model family to the picker, add an entry to `FAMILIES` in `public/app.js`, then run `npm run update-catalog` and `npm run calibrate`.
- `HF_API_BASE` (environment variable) points the server at a different API host, e.g. a local mock for testing.
