# Ask AI — New Tab

A Manifest V3 Chrome extension that lets you chat with OpenAI or Gemini, open favorite websites, view Google Calendar events, manage local events, and read headlines from multiple RSS sources directly inside every new tab. It streams AI responses in place and never redirects you unless you choose to open a news article.

## Install locally

1. Unzip the package.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Choose the extracted `ai-prompt-new-tab` folder.
6. Open a new tab and add an OpenAI or Gemini API key when prompted.

If version 1 is already installed, replace the old folder with this one and click the extension's **Reload** button on `chrome://extensions`.

## Use it

- Choose OpenAI or Gemini above the prompt.
- Press **Enter** to send and **Shift + Enter** for a new line.
- Use the square stop button to stop a response.
- Use **+** to start a fresh conversation.
- Add, edit, or remove up to eight website shortcuts below the prompt. Chrome supplies each site's favicon from its own favicon cache.
- Choose Aurora Night, Desert Dawn, Forest Mist, no background image, or upload your own image. Aurora Night is the default.
- The compact monthly calendar is visible immediately whenever a new tab opens.
- Use its arrows to browse months, select a date to open its agenda, and add timed or all-day events.
- To show Google Calendar events, open the gear, paste the calendar's **Secret address in iCal format**, then choose **Sync now** or **Save settings**.
- Find that address in Google Calendar: **Settings → Settings for my calendars → your calendar → Integrate calendar**.
- Google events are read-only, refresh every 15 minutes, and appear with a blue marker.
- Headlines from BBC News, NPR News, The Guardian, and Al Jazeera appear beneath the calendar and refresh every 15 minutes.
- Open **Manage feeds** to enable, disable, rename, remove, or replace a feed, or add your own HTTPS RSS/Atom source. Up to eight feeds are supported.
- Click the refresh icon for an immediate update or a headline to open the full article.
- Use the gear button to update API keys or model IDs.

The default models are `gpt-5-mini` and `gemini-2.5-flash`, and both can be changed in settings.

## Privacy and billing

- API keys are stored in Chrome's local extension storage.
- A key is sent only to its matching API endpoint when you submit a prompt.
- Conversation history lives only in the current tab and is cleared when the tab closes or you start a new chat.
- Calendar events stay in Chrome's local extension storage until you delete them.
- Website shortcuts stay in Chrome's local extension storage. Shortcut clicks open in the current tab.
- A custom background is resized and compressed in the browser, then saved only in Chrome's local extension storage.
- Your Google Calendar secret iCal address and a read-only event cache stay in Chrome's local extension storage. The address is sent only to `calendar.google.com` to refresh events. Treat it like a password and never share it.
- RSS feed choices and recent headlines are stored locally so the panel can populate quickly on the next new tab.
- API usage is billed separately by OpenAI or Google; a ChatGPT or Gemini subscription does not automatically include API usage.
- The extension has no analytics, remote code, or external server.

## Permissions

- `storage`: saves settings, shortcuts, calendar data, and cached headlines locally.
- `favicon`: shows website icons for shortcuts using Chrome's favicon cache.
- `api.openai.com`: sends OpenAI prompts and streams responses.
- `generativelanguage.googleapis.com`: sends Gemini prompts and streams responses.
- `feeds.bbci.co.uk`, `feeds.npr.org`, `theguardian.com`, and `aljazeera.com`: retrieve the enabled default RSS headline feeds.
- `calendar.google.com`: retrieves the private, read-only iCal feed you connect.
- Optional website access is requested only when you enable an RSS feed from another domain.
