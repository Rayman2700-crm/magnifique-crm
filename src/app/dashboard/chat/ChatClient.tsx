"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { supabaseBrowser } from "@/lib/supabase/client";

export type ChatMessageDTO = {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  fileName?: string | null;
  filePath?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  fileUrl?: string | null;
};

type TypingUser = {
  userId: string;
  userName: string;
  expiresAt: number;
};

type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  user_name: string;
  emoji: string;
  created_at: string;
};

type ReactionGroup = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

type PreviewImage = {
  url: string;
  name: string;
};

type ReplyTarget = {
  id: string;
  senderName: string;
  text: string;
  fileName?: string | null;
};

type ParsedReplyMessage = {
  isReply: boolean;
  replySender: string;
  replyPreview: string;
  bodyText: string;
};

type MentionUser = {
  userId: string;
  fullName: string;
};

type MentionState = {
  active: boolean;
  query: string;
  startIndex: number;
  endIndex: number;
};

export type RealtimeStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "👏", "🙏"];

const EMOJI_GROUPS = [
  {
    label: "Smileys",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "😂",
      "🤣",
      "🙂",
      "🙃",
      "😉",
      "😊",
      "😇",
      "🥰",
      "😍",
      "🤩",
      "😘",
      "😗",
      "☺️",
      "😚",
      "😙",
      "🥲",
      "😋",
      "😛",
      "😜",
      "🤪",
      "😝",
      "🤑",
      "🤗",
      "🤭",
      "🫢",
      "🫣",
      "🤫",
      "🤔",
      "🫡",
      "🤐",
      "🤨",
      "😐",
      "😑",
      "😶",
      "🫥",
      "😶‍🌫️",
      "😏",
      "😒",
      "🙄",
      "😬",
      "😮‍💨",
      "🤥",
      "😌",
      "😔",
      "😪",
      "🤤",
      "😴",
      "😷",
      "🤒",
      "🤕",
      "🤢",
      "🤮",
      "🤧",
      "🥵",
      "🥶",
      "🥴",
      "😵",
      "😵‍💫",
      "🤯",
      "🤠",
      "🥳",
      "🥸",
      "😎",
      "🤓",
      "🧐",
      "😕",
      "🫤",
      "😟",
      "🙁",
      "☹️",
      "😮",
      "😯",
      "😲",
      "😳",
      "🥺",
      "🥹",
      "😦",
      "😧",
      "😨",
      "😰",
      "😥",
      "😢",
      "😭",
      "😱",
      "😖",
      "😣",
      "😞",
      "😓",
      "😩",
      "😫",
      "🥱",
      "😤",
      "😡",
      "😠",
      "🤬",
      "😈",
      "👿",
      "💀",
      "☠️",
      "💩",
      "🤡",
      "👹",
      "👺",
      "👻",
      "👽",
      "👾",
      "🤖",
    ],
  },
  {
    label: "Gesten",
    emojis: [
      "👍",
      "👎",
      "👌",
      "🤌",
      "🤏",
      "✌️",
      "🤞",
      "🫰",
      "🤟",
      "🤘",
      "🤙",
      "👈",
      "👉",
      "👆",
      "🖕",
      "👇",
      "☝️",
      "🫵",
      "👋",
      "🤚",
      "🖐️",
      "✋",
      "🖖",
      "🫱",
      "🫲",
      "🫳",
      "🫴",
      "👏",
      "🙌",
      "🫶",
      "🤲",
      "🤝",
      "🙏",
      "✍️",
      "💅",
      "🤳",
      "💪",
      "🦾",
      "🦿",
      "🦵",
      "🦶",
      "👂",
      "🦻",
      "👃",
      "🧠",
      "🫀",
      "🫁",
      "🦷",
      "🦴",
      "👀",
      "👁️",
      "👅",
      "👄",
      "🫦",
    ],
  },
  {
    label: "Herzen",
    emojis: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "🩷",
      "🩵",
      "🩶",
      "💔",
      "❤️‍🔥",
      "❤️‍🩹",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
      "💟",
      "♥️",
      "💌",
      "💋",
      "💯",
      "💢",
      "💥",
      "💫",
      "💦",
      "💨",
      "🕳️",
      "💬",
      "👁️‍🗨️",
      "🗨️",
      "🗯️",
      "💭",
      "💤",
    ],
  },
  {
    label: "Menschen",
    emojis: [
      "👶",
      "🧒",
      "👦",
      "👧",
      "🧑",
      "👱",
      "👨",
      "🧔",
      "🧔‍♂️",
      "🧔‍♀️",
      "👨‍🦰",
      "👨‍🦱",
      "👨‍🦳",
      "👨‍🦲",
      "👩",
      "👩‍🦰",
      "🧑‍🦰",
      "👩‍🦱",
      "🧑‍🦱",
      "👩‍🦳",
      "🧑‍🦳",
      "👩‍🦲",
      "🧑‍🦲",
      "👱‍♀️",
      "👱‍♂️",
      "🧓",
      "👴",
      "👵",
      "🙍",
      "🙎",
      "🙅",
      "🙆",
      "💁",
      "🙋",
      "🧏",
      "🙇",
      "🤦",
      "🤷",
      "🧑‍⚕️",
      "👨‍⚕️",
      "👩‍⚕️",
      "🧑‍🎓",
      "🧑‍💻",
      "🧑‍🎨",
      "🧑‍✈️",
      "🧑‍🚀",
      "🧑‍⚖️",
      "👰",
      "🤵",
      "👸",
      "🤴",
      "🥷",
      "🦸",
      "🦹",
      "🤶",
      "🎅",
      "🧙",
      "🧝",
      "🧛",
      "🧟",
      "🧞",
      "🧜",
      "🧚",
      "👼",
      "🤰",
      "🫄",
      "🫃",
      "🤱",
      "👩‍🍼",
      "👨‍🍼",
      "🧑‍🍼",
      "💃",
      "🕺",
      "🕴️",
      "👯",
      "🧖",
      "🧘",
      "🛀",
      "🛌",
    ],
  },
  {
    label: "Tiere & Natur",
    emojis: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐻‍❄️",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐽",
      "🐸",
      "🐵",
      "🙈",
      "🙉",
      "🙊",
      "🐒",
      "🐔",
      "🐧",
      "🐦",
      "🐤",
      "🐣",
      "🐥",
      "🦆",
      "🦅",
      "🦉",
      "🦇",
      "🐺",
      "🐗",
      "🐴",
      "🦄",
      "🐝",
      "🪱",
      "🐛",
      "🦋",
      "🐌",
      "🐞",
      "🐜",
      "🪰",
      "🪲",
      "🪳",
      "🦟",
      "🦗",
      "🕷️",
      "🕸️",
      "🦂",
      "🐢",
      "🐍",
      "🦎",
      "🦖",
      "🦕",
      "🐙",
      "🦑",
      "🦐",
      "🦞",
      "🦀",
      "🐡",
      "🐠",
      "🐟",
      "🐬",
      "🐳",
      "🐋",
      "🦈",
      "🦭",
      "🐊",
      "🐅",
      "🐆",
      "🦓",
      "🦍",
      "🦧",
      "🦣",
      "🐘",
      "🦛",
      "🦏",
      "🐪",
      "🐫",
      "🦒",
      "🦘",
      "🦬",
      "🐃",
      "🐂",
      "🐄",
      "🐎",
      "🐖",
      "🐏",
      "🐑",
      "🦙",
      "🐐",
      "🦌",
      "🐕",
      "🐩",
      "🦮",
      "🐕‍🦺",
      "🐈",
      "🐈‍⬛",
      "🪶",
      "🐓",
      "🦃",
      "🦤",
      "🦚",
      "🦜",
      "🦢",
      "🦩",
      "🕊️",
      "🐇",
      "🦝",
      "🦨",
      "🦡",
      "🦫",
      "🦦",
      "🦥",
      "🐁",
      "🐀",
      "🐿️",
      "🦔",
      "🌵",
      "🎄",
      "🌲",
      "🌳",
      "🌴",
      "🪵",
      "🌱",
      "🌿",
      "☘️",
      "🍀",
      "🎍",
      "🪴",
      "🎋",
      "🍃",
      "🍂",
      "🍁",
      "🍄",
      "🐚",
      "🪨",
      "🌾",
      "💐",
      "🌷",
      "🌹",
      "🥀",
      "🌺",
      "🌸",
      "🌼",
      "🌻",
      "🌞",
      "🌝",
      "🌛",
      "🌜",
      "🌚",
      "🌕",
      "🌖",
      "🌗",
      "🌘",
      "🌑",
      "🌒",
      "🌓",
      "🌔",
      "🌙",
      "🌎",
      "🌍",
      "🌏",
      "🪐",
      "💫",
      "⭐",
      "🌟",
      "✨",
      "⚡",
      "☄️",
      "💥",
      "🔥",
      "🌪️",
      "🌈",
      "☀️",
      "🌤️",
      "⛅",
      "🌥️",
      "☁️",
      "🌦️",
      "🌧️",
      "⛈️",
      "🌩️",
      "🌨️",
      "❄️",
      "☃️",
      "⛄",
      "🌬️",
      "💨",
      "💧",
      "💦",
      "☔",
      "☂️",
      "🌊",
      "🌫️",
    ],
  },
  {
    label: "Essen",
    emojis: [
      "🍏",
      "🍎",
      "🍐",
      "🍊",
      "🍋",
      "🍌",
      "🍉",
      "🍇",
      "🍓",
      "🫐",
      "🍈",
      "🍒",
      "🍑",
      "🥭",
      "🍍",
      "🥥",
      "🥝",
      "🍅",
      "🍆",
      "🥑",
      "🥦",
      "🥬",
      "🥒",
      "🌶️",
      "🫑",
      "🌽",
      "🥕",
      "🫒",
      "🧄",
      "🧅",
      "🥔",
      "🍠",
      "🫘",
      "🥐",
      "🥯",
      "🍞",
      "🥖",
      "🥨",
      "🧀",
      "🥚",
      "🍳",
      "🧈",
      "🥞",
      "🧇",
      "🥓",
      "🥩",
      "🍗",
      "🍖",
      "🦴",
      "🌭",
      "🍔",
      "🍟",
      "🍕",
      "🫓",
      "🥪",
      "🥙",
      "🧆",
      "🌮",
      "🌯",
      "🫔",
      "🥗",
      "🥘",
      "🫕",
      "🥫",
      "🍝",
      "🍜",
      "🍲",
      "🍛",
      "🍣",
      "🍱",
      "🥟",
      "🦪",
      "🍤",
      "🍙",
      "🍚",
      "🍘",
      "🍥",
      "🥠",
      "🥮",
      "🍢",
      "🍡",
      "🍧",
      "🍨",
      "🍦",
      "🥧",
      "🧁",
      "🍰",
      "🎂",
      "🍮",
      "🍭",
      "🍬",
      "🍫",
      "🍿",
      "🍩",
      "🍪",
      "🌰",
      "🥜",
      "🍯",
      "🥛",
      "🍼",
      "☕",
      "🫖",
      "🍵",
      "🧃",
      "🥤",
      "🧋",
      "🍶",
      "🍺",
      "🍻",
      "🥂",
      "🍷",
      "🥃",
      "🍸",
      "🍹",
      "🧉",
      "🍾",
      "🧊",
      "🥄",
      "🍴",
      "🍽️",
      "🥣",
      "🥡",
      "🥢",
      "🧂",
    ],
  },
  {
    label: "Aktivität",
    emojis: [
      "⚽",
      "🏀",
      "🏈",
      "⚾",
      "🥎",
      "🎾",
      "🏐",
      "🏉",
      "🥏",
      "🎱",
      "🪀",
      "🏓",
      "🏸",
      "🏒",
      "🏑",
      "🥍",
      "🏏",
      "🪃",
      "🥅",
      "⛳",
      "🪁",
      "🏹",
      "🎣",
      "🤿",
      "🥊",
      "🥋",
      "🎽",
      "🛹",
      "🛼",
      "🛷",
      "⛸️",
      "🥌",
      "🎿",
      "⛷️",
      "🏂",
      "🪂",
      "🏋️",
      "🤼",
      "🤸",
      "⛹️",
      "🤺",
      "🤾",
      "🏌️",
      "🏇",
      "🧘",
      "🏄",
      "🏊",
      "🤽",
      "🚣",
      "🧗",
      "🚵",
      "🚴",
      "🏆",
      "🥇",
      "🥈",
      "🥉",
      "🏅",
      "🎖️",
      "🏵️",
      "🎗️",
      "🎫",
      "🎟️",
      "🎪",
      "🤹",
      "🎭",
      "🩰",
      "🎨",
      "🎬",
      "🎤",
      "🎧",
      "🎼",
      "🎹",
      "🥁",
      "🪘",
      "🎷",
      "🎺",
      "🪗",
      "🎸",
      "🪕",
      "🎻",
      "🎲",
      "♟️",
      "🎯",
      "🎳",
      "🎮",
      "🎰",
      "🧩",
    ],
  },
  {
    label: "Objekte",
    emojis: [
      "⌚",
      "📱",
      "📲",
      "💻",
      "⌨️",
      "🖥️",
      "🖨️",
      "🖱️",
      "🖲️",
      "🕹️",
      "🗜️",
      "💽",
      "💾",
      "💿",
      "📀",
      "📼",
      "📷",
      "📸",
      "📹",
      "🎥",
      "📽️",
      "🎞️",
      "📞",
      "☎️",
      "📟",
      "📠",
      "📺",
      "📻",
      "🎙️",
      "🎚️",
      "🎛️",
      "🧭",
      "⏱️",
      "⏲️",
      "⏰",
      "🕰️",
      "⌛",
      "⏳",
      "📡",
      "🔋",
      "🪫",
      "🔌",
      "💡",
      "🔦",
      "🕯️",
      "🪔",
      "🧯",
      "🛢️",
      "💸",
      "💵",
      "💴",
      "💶",
      "💷",
      "🪙",
      "💰",
      "💳",
      "💎",
      "⚖️",
      "🪜",
      "🧰",
      "🪛",
      "🔧",
      "🔨",
      "⚒️",
      "🛠️",
      "⛏️",
      "🪓",
      "🪚",
      "🔩",
      "⚙️",
      "🪤",
      "🧱",
      "⛓️",
      "🧲",
      "🔫",
      "💣",
      "🧨",
      "🪓",
      "🔪",
      "🗡️",
      "⚔️",
      "🛡️",
      "🚬",
      "⚰️",
      "🪦",
      "⚱️",
      "🏺",
      "🔮",
      "📿",
      "🧿",
      "💈",
      "⚗️",
      "🔭",
      "🔬",
      "🕳️",
      "🩹",
      "🩺",
      "💊",
      "💉",
      "🩸",
      "🧬",
      "🦠",
      "🧫",
      "🧪",
      "🌡️",
      "🧹",
      "🪠",
      "🧺",
      "🧻",
      "🚽",
      "🚰",
      "🚿",
      "🛁",
      "🛀",
      "🧼",
      "🪥",
      "🪒",
      "🧽",
      "🪣",
      "🧴",
      "🛎️",
      "🔑",
      "🗝️",
      "🚪",
      "🪑",
      "🛋️",
      "🛏️",
      "🛌",
      "🧸",
      "🪆",
      "🖼️",
      "🪞",
      "🪟",
      "🛍️",
      "🛒",
      "🎁",
      "🎈",
      "🎏",
      "🎀",
      "🪄",
      "🪅",
      "🎊",
      "🎉",
      "🪩",
      "📩",
      "📨",
      "📧",
      "💌",
      "📥",
      "📤",
      "📦",
      "🏷️",
      "🪧",
      "📪",
      "📫",
      "📬",
      "📭",
      "📮",
      "📯",
      "📜",
      "📃",
      "📄",
      "📑",
      "🧾",
      "📊",
      "📈",
      "📉",
      "🗒️",
      "🗓️",
      "📆",
      "📅",
      "🗑️",
      "📇",
      "🗃️",
      "🗳️",
      "🗄️",
      "📋",
      "📁",
      "📂",
      "🗂️",
      "🗞️",
      "📰",
      "📓",
      "📔",
      "📒",
      "📕",
      "📗",
      "📘",
      "📙",
      "📚",
      "📖",
      "🔖",
      "🧷",
      "🔗",
      "📎",
      "🖇️",
      "📐",
      "📏",
      "🧮",
      "📌",
      "📍",
      "✂️",
      "🖊️",
      "🖋️",
      "✒️",
      "🖌️",
      "🖍️",
      "📝",
      "✏️",
      "🔍",
      "🔎",
      "🔏",
      "🔐",
      "🔒",
      "🔓",
    ],
  },
  {
    label: "Reisen",
    emojis: [
      "🚗",
      "🚕",
      "🚙",
      "🚌",
      "🚎",
      "🏎️",
      "🚓",
      "🚑",
      "🚒",
      "🚐",
      "🛻",
      "🚚",
      "🚛",
      "🚜",
      "🦯",
      "🦽",
      "🦼",
      "🛴",
      "🚲",
      "🛵",
      "🏍️",
      "🛺",
      "🚨",
      "🚔",
      "🚍",
      "🚘",
      "🚖",
      "🚡",
      "🚠",
      "🚟",
      "🚃",
      "🚋",
      "🚞",
      "🚝",
      "🚄",
      "🚅",
      "🚈",
      "🚂",
      "🚆",
      "🚇",
      "🚊",
      "🚉",
      "✈️",
      "🛫",
      "🛬",
      "🛩️",
      "💺",
      "🛰️",
      "🚀",
      "🛸",
      "🚁",
      "🛶",
      "⛵",
      "🚤",
      "🛥️",
      "🛳️",
      "⛴️",
      "🚢",
      "⚓",
      "🛟",
      "🪝",
      "⛽",
      "🚧",
      "🚦",
      "🚥",
      "🚏",
      "🗺️",
      "🗿",
      "🗽",
      "🗼",
      "🏰",
      "🏯",
      "🏟️",
      "🎡",
      "🎢",
      "🎠",
      "⛲",
      "⛱️",
      "🏖️",
      "🏝️",
      "🏜️",
      "🌋",
      "⛰️",
      "🏔️",
      "🗻",
      "🏕️",
      "⛺",
      "🛖",
      "🏠",
      "🏡",
      "🏘️",
      "🏚️",
      "🏗️",
      "🏭",
      "🏢",
      "🏬",
      "🏣",
      "🏤",
      "🏥",
      "🏦",
      "🏨",
      "🏪",
      "🏫",
      "🏩",
      "💒",
      "🏛️",
      "⛪",
      "🕌",
      "🕍",
      "🛕",
      "🕋",
      "⛩️",
      "🛤️",
      "🛣️",
      "🗾",
      "🎑",
      "🏞️",
      "🌅",
      "🌄",
      "🌠",
      "🎇",
      "🎆",
      "🌇",
      "🌆",
      "🏙️",
      "🌃",
      "🌌",
      "🌉",
      "🌁",
    ],
  },
  {
    label: "Symbole",
    emojis: [
      "✅",
      "☑️",
      "✔️",
      "❌",
      "❎",
      "➕",
      "➖",
      "➗",
      "✖️",
      "🟰",
      "♾️",
      "‼️",
      "⁉️",
      "❓",
      "❔",
      "❕",
      "❗",
      "〰️",
      "💱",
      "💲",
      "⚕️",
      "♻️",
      "⚜️",
      "🔱",
      "📛",
      "🔰",
      "⭕",
      "🟢",
      "🟡",
      "🟠",
      "🔴",
      "🟣",
      "🔵",
      "⚫",
      "⚪",
      "🟤",
      "⬛",
      "⬜",
      "◼️",
      "◻️",
      "◾",
      "◽",
      "▪️",
      "▫️",
      "🔶",
      "🔷",
      "🔸",
      "🔹",
      "🔺",
      "🔻",
      "💠",
      "🔘",
      "🔳",
      "🔲",
      "🏁",
      "🚩",
      "🎌",
      "🏴",
      "🏳️",
      "🏳️‍🌈",
      "🏳️‍⚧️",
      "🏴‍☠️",
      "🇦🇹",
      "🇩🇪",
      "🇷🇴",
      "🇪🇺",
      "🇺🇸",
      "🇬🇧",
      "🇨🇭",
      "🇮🇹",
      "🇫🇷",
      "🇪🇸",
    ],
  },
];

const ALL_PICKER_EMOJIS = EMOJI_GROUPS.flatMap((group) => group.emojis);

const EMOJI_SEARCH_ALIASES: Record<string, string> = {
  "😀": "grinsen lachen smile happy froh",
  "😃": "lachen smile happy froh",
  "😄": "lachen smile happy froh",
  "😁": "grinsen lachen smile happy froh",
  "😆": "lachen smile happy froh",
  "😅": "lachen schwitzen erleichtert",
  "😂": "lachen tränen lachtränen lol haha lustig",
  "🤣": "lachen tränen lachtränen lol haha lustig rofl",
  "🙂": "lächeln smile nett",
  "🙃": "umgedreht scherz ironie",
  "😉": "zwinkern wink flirt",
  "😊": "lächeln blush happy froh",
  "😇": "engel brav unschuldig",
  "🥰": "liebe verliebt herzen glücklich",
  "😍": "liebe verliebt herz augen",
  "🤩": "star begeistert wow",
  "😘": "kuss liebe",
  "😗": "kuss",
  "☺️": "lächeln blush",
  "😚": "kuss",
  "😙": "kuss",
  "😋": "lecker zunge essen",
  "😛": "zunge frech",
  "😜": "zunge zwinkern frech",
  "🤪": "verrückt crazy frech",
  "🤗": "umarmung hug",
  "🤭": "oops kichern hand mund",
  "🤫": "psst ruhig leise",
  "🤔": "denken nachdenken frage",
  "😐": "neutral ernst",
  "😑": "genervt neutral",
  "🙄": "augen rollen genervt",
  "😬": "grimasse peinlich",
  "😌": "erleichtert ruhig",
  "😔": "traurig traurig nachdenklich",
  "😪": "müde schläfrig",
  "😴": "schlafen müde",
  "😷": "krank maske",
  "🤒": "krank fieber",
  "🤕": "krank verletzt",
  "🤢": "übel krank",
  "🤮": "kotzen erbrechen krank",
  "🤧": "krank niesen",
  "🥵": "heiß warm schwitzen",
  "🥶": "kalt frieren",
  "🥴": "benommen dizzy",
  "😵": "schwindlig tot",
  "🤯": "explodiert schock wow",
  "🥳": "party feiern geburtstag",
  "😎": "cool sonnenbrille",
  "🤓": "nerd klug brille",
  "😕": "verwirrt unsicher",
  "😟": "sorge besorgt",
  "🙁": "traurig unglücklich",
  "☹️": "traurig unglücklich",
  "😮": "überrascht wow offen mund",
  "😯": "überrascht wow",
  "😲": "schock überrascht wow",
  "😳": "rot peinlich überrascht",
  "🥺": "bitte traurig puppy",
  "🥹": "gerührt tränen",
  "😨": "angst schock",
  "😰": "angst schwitzen",
  "😥": "traurig erleichtert schwitzen",
  "😢": "weinen traurig träne cry crying",
  "😭": "weinen traurig heulen tränen cry crying schluchzen",
  "😱": "schrei angst schock",
  "😖": "frustriert traurig",
  "😣": "frustriert traurig",
  "😞": "enttäuscht traurig",
  "😓": "schwitzen traurig",
  "😩": "erschöpft müde traurig",
  "😫": "erschöpft müde traurig",
  "🥱": "gähnen müde",
  "😤": "wütend sauer dampf",
  "😡": "wütend sauer rot",
  "😠": "wütend sauer",
  "🤬": "fluchen wütend sauer",
  "👍": "daumen hoch gut like ja ok passt",
  "👎": "daumen runter schlecht nein dislike",
  "👌": "ok perfekt gut",
  "✌️": "peace zwei",
  "🙏": "bitte danke beten flehen",
  "👏": "klatschen applaus bravo",
  "🙌": "jubel hände hoch feiern",
  "👋": "winken hallo bye",
  "🤝": "handschlag deal",
  "💪": "stark muskel kraft",
  "❤️": "herz liebe rot",
  "🧡": "herz orange liebe",
  "💛": "herz gelb liebe",
  "💚": "herz grün liebe",
  "💙": "herz blau liebe",
  "💜": "herz lila liebe",
  "🖤": "herz schwarz liebe",
  "🤍": "herz weiß liebe",
  "💔": "gebrochenes herz traurig",
  "🔥": "feuer heiß top stark",
  "✨": "glitzer sparkle schön",
  "✅": "check erledigt ok ja",
  "❌": "x nein falsch löschen",
  "⭐": "stern favorit",
  "🌟": "stern glitzern favorit",
  "🎉": "party feiern konfetti",
  "🎂": "kuchen geburtstag",
  "☕": "kaffee cafe",
  "🍾": "sekt feiern",
};

const EMOJI_UNICODE_SEARCH_ALIASES: Record<string, string> = {
  "😀": "grinning face gesicht smiley mimik grinsen lachen",
  "😃": "smiling face with open mouth gesicht smiley mimik lächeln lachen happy glücklich froh mund stift schreiben",
  "😄": "smiling face with open mouth and smiling eyes gesicht smiley mimik lächeln lachen happy glücklich froh augen sehen auge sehen mund stift schreiben",
  "😁": "grinning face with smiling eyes gesicht smiley mimik lächeln lachen happy glücklich froh grinsen lachen augen sehen auge sehen",
  "😆": "smiling face with open mouth and tightly closed eyes gesicht smiley mimik lächeln lachen happy glücklich froh augen sehen auge sehen mund stift schreiben",
  "😅": "smiling face with open mouth and cold sweat gesicht smiley mimik lächeln lachen happy glücklich froh mund stift schreiben kalt frieren",
  "😂": "face with tears of joy gesicht smiley mimik tränen weinen träne weinen freude froh glücklich lustig",
  "🤣": "rolling on the floor laughing lachen lustig haha",
  "🙂": "slightly smiling face gesicht smiley mimik lächeln lachen happy glücklich froh licht lampe",
  "🙃": "upside down face gesicht smiley mimik hoch runter",
  "😉": "winking face gesicht smiley mimik",
  "😊": "smiling face with smiling eyes gesicht smiley mimik lächeln lachen happy glücklich froh augen sehen auge sehen",
  "😇": "smiling face with halo gesicht smiley mimik lächeln lachen happy glücklich froh",
  "🥰": "smiling face with smiling eyes and three hearts gesicht smiley mimik lächeln lachen happy glücklich froh herz liebe augen sehen auge sehen",
  "😍": "smiling face with heart shaped eyes gesicht smiley mimik lächeln lachen happy glücklich froh herz liebe augen sehen auge sehen",
  "🤩": "grinning face with star eyes gesicht smiley mimik grinsen lachen augen sehen auge sehen stern",
  "😘": "face throwing a kiss gesicht smiley mimik kuss liebe",
  "😗": "kissing face gesicht smiley mimik kuss liebe",
  "☺️": "white smiling face gesicht smiley mimik lächeln lachen happy glücklich froh weiß weiss",
  "😚": "kissing face with closed eyes gesicht smiley mimik kuss liebe augen sehen auge sehen",
  "😙": "kissing face with smiling eyes gesicht smiley mimik lächeln lachen happy glücklich froh kuss liebe augen sehen auge sehen",
  "🥲": "smiling face with tear gesicht smiley mimik lächeln lachen happy glücklich froh träne weinen",
  "😋": "face savouring delicious food gesicht smiley mimik essen",
  "😛": "face with stuck out tongue gesicht smiley mimik zunge",
  "😜": "face with stuck out tongue and winking eye gesicht smiley mimik auge sehen zunge",
  "🤪": "grinning face with one large and one small eye gesicht smiley mimik grinsen lachen auge sehen",
  "😝": "face with stuck out tongue and tightly closed eyes gesicht smiley mimik augen sehen auge sehen zunge",
  "🤑": "money mouth face gesicht smiley mimik geld euro bezahlen mund",
  "🤗": "hugging face gesicht smiley mimik",
  "🤭": "smiling face with smiling eyes and hand covering mouth gesicht smiley mimik lächeln lachen happy glücklich froh augen sehen auge sehen hand mund",
  "🫢": "face with open eyes and hand over mouth gesicht smiley mimik augen sehen auge sehen hand mund stift schreiben",
  "🫣": "face with peeking eye gesicht smiley mimik auge sehen",
  "🤫": "face with finger covering closed lips gesicht smiley mimik lippen mund",
  "🤔": "thinking face gesicht smiley mimik",
  "🫡": "saluting face gesicht smiley mimik",
  "🤐": "zipper mouth face gesicht smiley mimik mund",
  "🤨": "face with one eyebrow raised gesicht smiley mimik auge sehen",
  "😐": "neutral face gesicht smiley mimik",
  "😑": "expressionless face gesicht smiley mimik",
  "😶": "face without mouth gesicht smiley mimik mund",
  "🫥": "dotted line face gesicht smiley mimik",
  "😶‍🌫️": "face without mouth zero width joiner fog gesicht smiley mimik mund",
  "😏": "smirking face gesicht smiley mimik",
  "😒": "unamused face gesicht smiley mimik",
  "🙄": "face with rolling eyes gesicht smiley mimik augen sehen auge sehen",
  "😬": "grimacing face gesicht smiley mimik",
  "😮‍💨": "face with open mouth zero width joiner dash symbol gesicht smiley mimik mund stift schreiben",
  "🤥": "lying face gesicht smiley mimik",
  "😌": "relieved face gesicht smiley mimik",
  "😔": "pensive face gesicht smiley mimik stift schreiben",
  "😪": "sleepy face gesicht smiley mimik schlafen müde",
  "🤤": "drooling face gesicht smiley mimik",
  "😴": "sleeping face gesicht smiley mimik schlafen müde schlafen müde",
  "😷": "face with medical mask gesicht smiley mimik medizin arzt",
  "🤒": "face with thermometer gesicht smiley mimik",
  "🤕": "face with head bandage gesicht smiley mimik",
  "🤢": "nauseated face gesicht smiley mimik",
  "🤮": "face with open mouth vomiting gesicht smiley mimik mund stift schreiben",
  "🤧": "sneezing face gesicht smiley mimik",
  "🥵": "overheated face gesicht smiley mimik",
  "🥶": "freezing face gesicht smiley mimik",
  "🥴": "face with uneven eyes and wavy mouth gesicht smiley mimik augen sehen auge sehen mund",
  "😵": "dizzy face gesicht smiley mimik",
  "😵‍💫": "dizzy face zero width joiner dizzy symbol gesicht smiley mimik",
  "🤯": "shocked face with exploding head gesicht smiley mimik",
  "🤠": "face with cowboy hat gesicht smiley mimik junge kind kuh tier",
  "🥳": "face with party horn and party hat gesicht smiley mimik party feiern",
  "🥸": "disguised face gesicht smiley mimik",
  "😎": "smiling face with sunglasses gesicht smiley mimik lächeln lachen happy glücklich froh sonne wetter",
  "🤓": "nerd face gesicht smiley mimik",
  "🧐": "face with monocle gesicht smiley mimik",
  "😕": "confused face gesicht smiley mimik",
  "🫤": "face with diagonal mouth gesicht smiley mimik mund",
  "😟": "worried face gesicht smiley mimik",
  "🙁": "slightly frowning face gesicht smiley mimik licht lampe",
  "☹️": "white frowning face gesicht smiley mimik weiß weiss",
  "😮": "face with open mouth gesicht smiley mimik mund stift schreiben",
  "😯": "hushed face gesicht smiley mimik",
  "😲": "astonished face gesicht smiley mimik",
  "😳": "flushed face gesicht smiley mimik",
  "🥺": "face with pleading eyes gesicht smiley mimik augen sehen auge sehen",
  "🥹": "face holding back tears gesicht smiley mimik tränen weinen träne weinen",
  "😦": "frowning face with open mouth gesicht smiley mimik mund stift schreiben",
  "😧": "anguished face gesicht smiley mimik",
  "😨": "fearful face gesicht smiley mimik",
  "😰": "face with open mouth and cold sweat gesicht smiley mimik mund stift schreiben kalt frieren",
  "😥": "disappointed but relieved face gesicht smiley mimik",
  "😢": "crying face gesicht smiley mimik weinen traurig",
  "😭": "loudly crying face gesicht smiley mimik weinen traurig laut stark",
  "😱": "face screaming in fear gesicht smiley mimik",
  "😖": "confounded face gesicht smiley mimik",
  "😣": "persevering face gesicht smiley mimik",
  "😞": "disappointed face gesicht smiley mimik",
  "😓": "face with cold sweat gesicht smiley mimik kalt frieren",
  "😩": "weary face gesicht smiley mimik",
  "😫": "tired face gesicht smiley mimik rot",
  "🥱": "yawning face gesicht smiley mimik",
  "😤": "face with look of triumph gesicht smiley mimik ok gut",
  "😡": "pouting face gesicht smiley mimik",
  "😠": "angry face gesicht smiley mimik wütend sauer",
  "🤬": "serious face with symbols covering mouth gesicht smiley mimik mund",
  "😈": "smiling face with horns gesicht smiley mimik lächeln lachen happy glücklich froh",
  "👿": "imp",
  "💀": "skull",
  "☠️": "skull and crossbones kreuz x nein falsch löschen knochen",
  "💩": "pile of poo",
  "🤡": "clown face gesicht smiley mimik",
  "👹": "japanese ogre",
  "👺": "japanese goblin",
  "👻": "ghost",
  "👽": "extraterrestrial alien",
  "👾": "alien monster",
  "🤖": "robot face gesicht smiley mimik",
  "👍": "thumbs up sign daumen daumen hoch",
  "👎": "thumbs down sign daumen daumen runter",
  "👌": "ok hand sign hand ok gut",
  "🤌": "pinched fingers",
  "🤏": "pinching hand hand",
  "✌️": "victory hand hand",
  "🤞": "hand with index and middle fingers crossed hand kreuz x nein falsch löschen",
  "🫰": "hand with index finger and thumb crossed hand daumen kreuz x nein falsch löschen",
  "🤟": "i love you hand sign hand",
  "🤘": "sign of the horns",
  "🤙": "call me hand hand",
  "👈": "white left pointing backhand index hand weiß weiss links",
  "👉": "white right pointing backhand index hand weiß weiss rechts",
  "👆": "white up pointing backhand index hand weiß weiss hoch",
  "🖕": "reversed hand with middle finger extended hand",
  "👇": "white down pointing backhand index hand weiß weiss runter",
  "☝️": "white up pointing index weiß weiss hoch",
  "🫵": "index pointing at the viewer",
  "👋": "waving hand sign hand",
  "🤚": "raised back of hand hand",
  "🖐️": "raised hand with fingers splayed hand",
  "✋": "raised hand hand",
  "🖖": "raised hand with part between middle and ring fingers hand",
  "🫱": "rightwards hand hand rechts",
  "🫲": "leftwards hand hand links",
  "🫳": "palm down hand hand runter",
  "🫴": "palm up hand hand hoch",
  "👏": "clapping hands sign hand hände hand klatschen applaus bravo",
  "🙌": "person raising both hands in celebration hand hände hand person mensch",
  "🫶": "heart hands herz liebe hand hände hand",
  "🤲": "palms up together hoch",
  "🤝": "handshake hand hände hand",
  "🙏": "person with folded hands hand hände hand person mensch",
  "✍️": "writing hand hand",
  "💅": "nail polish nagel manicure pedicure beauty",
  "🤳": "selfie",
  "💪": "flexed biceps",
  "🦾": "mechanical arm",
  "🦿": "mechanical leg",
  "🦵": "leg",
  "🦶": "foot fuß fuss",
  "👂": "ear",
  "🦻": "ear with hearing aid",
  "👃": "nose",
  "🧠": "brain regen wetter gehirn",
  "🫀": "anatomical heart herz liebe",
  "🫁": "lungs",
  "🦷": "tooth zahn",
  "🦴": "bone knochen",
  "👀": "eyes augen sehen auge sehen",
  "👁️": "eye auge sehen",
  "👅": "tongue zunge",
  "👄": "mouth mund",
  "🫦": "biting lip",
  "❤️": "heavy black heart herz liebe schwarz",
  "🧡": "orange heart herz liebe orange",
  "💛": "yellow heart herz liebe gelb",
  "💚": "green heart herz liebe grün",
  "💙": "blue heart herz liebe blau",
  "💜": "purple heart herz liebe lila violett",
  "🖤": "black heart herz liebe schwarz",
  "🤍": "white heart herz liebe weiß weiss",
  "🤎": "brown heart herz liebe braun",
  "🩷": "pink heart herz liebe rosa pink",
  "🩵": "light blue heart herz liebe blau licht lampe",
  "🩶": "grey heart herz liebe",
  "💔": "broken heart herz liebe ok gut",
  "❤️‍🔥": "heavy black heart zero width joiner fire herz liebe feuer heiß schwarz",
  "❤️‍🩹": "heavy black heart zero width joiner adhesive bandage herz liebe schwarz",
  "❣️": "heavy heart exclamation mark ornament herz liebe",
  "💕": "two hearts herz liebe",
  "💞": "revolving hearts herz liebe",
  "💓": "beating heart herz liebe",
  "💗": "growing heart herz liebe",
  "💖": "sparkling heart herz liebe",
  "💘": "heart with arrow herz liebe pfeil",
  "💝": "heart with ribbon herz liebe",
  "💟": "heart decoration herz liebe",
  "♥️": "black heart suit herz liebe schwarz",
  "💌": "love letter",
  "💋": "kiss mark kuss liebe",
  "💯": "hundred points symbol rot",
  "💢": "anger symbol",
  "💥": "collision symbol",
  "💫": "dizzy symbol",
  "💦": "splashing sweat symbol",
  "💨": "dash symbol",
  "🕳️": "hole",
  "💬": "speech balloon ball sport",
  "👁️‍🗨️": "eye zero width joiner left speech bubble auge sehen links",
  "🗨️": "left speech bubble links",
  "🗯️": "right anger bubble rechts",
  "💭": "thought balloon ball sport",
  "💤": "sleeping symbol schlafen müde schlafen müde",
  "👶": "baby baby kind",
  "🧒": "child kind",
  "👦": "boy junge kind",
  "👧": "girl mädchen kind",
  "🧑": "adult",
  "👱": "person with blond hair person mensch",
  "👨": "man mann mensch",
  "🧔": "bearded person person mensch bär tier",
  "🧔‍♂️": "bearded person zero width joiner male sign person mensch bär tier",
  "🧔‍♀️": "bearded person zero width joiner female sign person mensch bär tier",
  "👨‍🦰": "man zero width joiner emoji component red hair mann mensch rot",
  "👨‍🦱": "man zero width joiner emoji component curly hair mann mensch",
  "👨‍🦳": "man zero width joiner emoji component white hair mann mensch weiß weiss",
  "👨‍🦲": "man zero width joiner emoji component bald mann mensch",
  "👩": "woman mann mensch frau mensch",
  "👩‍🦰": "woman zero width joiner emoji component red hair mann mensch frau mensch rot",
  "🧑‍🦰": "adult zero width joiner emoji component red hair rot",
  "👩‍🦱": "woman zero width joiner emoji component curly hair mann mensch frau mensch",
  "🧑‍🦱": "adult zero width joiner emoji component curly hair",
  "👩‍🦳": "woman zero width joiner emoji component white hair mann mensch frau mensch weiß weiss",
  "🧑‍🦳": "adult zero width joiner emoji component white hair weiß weiss",
  "👩‍🦲": "woman zero width joiner emoji component bald mann mensch frau mensch",
  "🧑‍🦲": "adult zero width joiner emoji component bald",
  "👱‍♀️": "person with blond hair zero width joiner female sign person mensch",
  "👱‍♂️": "person with blond hair zero width joiner male sign person mensch",
  "🧓": "older adult alt opa oma",
  "👴": "older man mann mensch alt opa oma",
  "👵": "older woman mann mensch frau mensch alt opa oma",
  "🙍": "person frowning person mensch",
  "🙎": "person with pouting face gesicht smiley mimik person mensch",
  "🙅": "face with no good gesture gesicht smiley mimik",
  "🙆": "face with ok gesture gesicht smiley mimik ok gut",
  "💁": "information desk person person mensch",
  "🙋": "happy person raising one hand hand person mensch",
  "🧏": "deaf person person mensch",
  "🙇": "person bowing deeply person mensch",
  "🤦": "face palm gesicht smiley mimik",
  "🤷": "shrug",
  "🧑‍⚕️": "adult zero width joiner staff of aesculapius",
  "👨‍⚕️": "man zero width joiner staff of aesculapius mann mensch",
  "👩‍⚕️": "woman zero width joiner staff of aesculapius mann mensch frau mensch",
  "🧑‍🎓": "adult zero width joiner graduation cap",
  "🧑‍💻": "adult zero width joiner personal computer person mensch computer laptop",
  "🧑‍🎨": "adult zero width joiner artist palette",
  "🧑‍✈️": "adult zero width joiner airplane flugzeug fliegen",
  "🧑‍🚀": "adult zero width joiner rocket rakete start",
  "🧑‍⚖️": "adult zero width joiner scales",
  "👰": "bride with veil",
  "🤵": "man in tuxedo mann mensch",
  "👸": "princess",
  "🤴": "prince",
  "🥷": "ninja",
  "🦸": "superhero hoch",
  "🦹": "supervillain hoch",
  "🤶": "mother christmas",
  "🎅": "father christmas",
  "🧙": "mage",
  "🧝": "elf",
  "🧛": "vampire",
  "🧟": "zombie",
  "🧞": "genie",
  "🧜": "merperson person mensch",
  "🧚": "fairy",
  "👼": "baby angel baby kind",
  "🤰": "pregnant woman mann mensch frau mensch",
  "🫄": "pregnant person person mensch",
  "🫃": "pregnant man mann mensch",
  "🤱": "breast feeding",
  "👩‍🍼": "woman zero width joiner baby bottle mann mensch frau mensch baby kind",
  "👨‍🍼": "man zero width joiner baby bottle mann mensch baby kind",
  "🧑‍🍼": "adult zero width joiner baby bottle baby kind",
  "💃": "dancer",
  "🕺": "man dancing mann mensch",
  "🕴️": "man in business suit levitating mann mensch bus fahrzeug",
  "👯": "woman with bunny ears mann mensch frau mensch",
  "🧖": "person in steamy room person mensch",
  "🧘": "person in lotus position person mensch",
  "🛀": "bath badewanne bad",
  "🛌": "sleeping accommodation schlafen müde schlafen müde",
  "🐶": "dog face gesicht smiley mimik hund tier",
  "🐱": "cat face gesicht smiley mimik katze tier",
  "🐭": "mouse face gesicht smiley mimik maus tier",
  "🐹": "hamster face gesicht smiley mimik",
  "🐰": "rabbit face gesicht smiley mimik hase tier",
  "🦊": "fox face gesicht smiley mimik",
  "🐻": "bear face gesicht smiley mimik bär tier",
  "🐼": "panda face gesicht smiley mimik",
  "🐻‍❄️": "bear face zero width joiner snowflake gesicht smiley mimik bär tier schnee wetter",
  "🐨": "koala",
  "🐯": "tiger face gesicht smiley mimik tiger tier",
  "🦁": "lion face gesicht smiley mimik löwe tier",
  "🐮": "cow face gesicht smiley mimik kuh tier",
  "🐷": "pig face gesicht smiley mimik schwein tier",
  "🐽": "pig nose schwein tier",
  "🐸": "frog face gesicht smiley mimik",
  "🐵": "monkey face gesicht smiley mimik affe tier schlüssel",
  "🙈": "see no evil monkey affe tier schlüssel",
  "🙉": "hear no evil monkey affe tier schlüssel",
  "🙊": "speak no evil monkey affe tier schlüssel",
  "🐒": "monkey affe tier schlüssel",
  "🐔": "chicken huhn tier",
  "🐧": "penguin stift schreiben",
  "🐦": "bird vogel tier",
  "🐤": "baby chick baby kind",
  "🐣": "hatching chick",
  "🐥": "front facing baby chick baby kind",
  "🦆": "duck ente tier",
  "🦅": "eagle adler tier",
  "🦉": "owl eule tier",
  "🦇": "bat",
  "🐺": "wolf face gesicht smiley mimik wolf tier",
  "🐗": "boar",
  "🐴": "horse face gesicht smiley mimik pferd tier",
  "🦄": "unicorn face gesicht smiley mimik",
  "🐝": "honeybee",
  "🪱": "worm",
  "🐛": "bug",
  "🦋": "butterfly",
  "🐌": "snail nagel manicure pedicure beauty",
  "🐞": "lady beetle",
  "🐜": "ant",
  "🪰": "fly",
  "🪲": "beetle",
  "🪳": "cockroach",
  "🦟": "mosquito",
  "🦗": "cricket",
  "🕷️": "spider",
  "🕸️": "spider web",
  "🦂": "scorpion",
  "🐢": "turtle",
  "🐍": "snake",
  "🦎": "lizard",
  "🦖": "t rex",
  "🦕": "sauropod",
  "🐙": "octopus",
  "🦑": "squid",
  "🦐": "shrimp",
  "🦞": "lobster",
  "🦀": "crab",
  "🐡": "blowfish fisch tier",
  "🐠": "tropical fish fisch tier",
  "🐟": "fish fisch tier",
  "🐬": "dolphin",
  "🐳": "spouting whale",
  "🐋": "whale",
  "🦈": "shark",
  "🦭": "seal",
  "🐊": "crocodile",
  "🐅": "tiger tiger tier",
  "🐆": "leopard",
  "🦓": "zebra face gesicht smiley mimik",
  "🦍": "gorilla",
  "🦧": "orangutan",
  "🦣": "mammoth",
  "🐘": "elephant",
  "🦛": "hippopotamus",
  "🦏": "rhinoceros",
  "🐪": "dromedary camel",
  "🐫": "bactrian camel",
  "🦒": "giraffe face gesicht smiley mimik",
  "🦘": "kangaroo",
  "🦬": "bison",
  "🐃": "water buffalo wasser",
  "🐂": "ox",
  "🐄": "cow kuh tier",
  "🐎": "horse pferd tier",
  "🐖": "pig schwein tier",
  "🐏": "ram",
  "🐑": "sheep",
  "🦙": "llama",
  "🐐": "goat",
  "🦌": "deer",
  "🐕": "dog hund tier",
  "🐩": "poodle",
  "🦮": "guide dog hund tier",
  "🐕‍🦺": "dog zero width joiner safety vest hund tier",
  "🐈": "cat katze tier",
  "🐈‍⬛": "cat zero width joiner black large square katze tier schwarz",
  "🪶": "feather",
  "🐓": "rooster",
  "🦃": "turkey schlüssel",
  "🦤": "dodo",
  "🦚": "peacock",
  "🦜": "parrot",
  "🦢": "swan",
  "🦩": "flamingo",
  "🕊️": "dove of peace",
  "🐇": "rabbit hase tier",
  "🦝": "raccoon",
  "🦨": "skunk",
  "🦡": "badger",
  "🦫": "beaver",
  "🦦": "otter",
  "🦥": "sloth",
  "🐁": "mouse maus tier",
  "🐀": "rat",
  "🐿️": "chipmunk",
  "🦔": "hedgehog",
  "🌵": "cactus",
  "🎄": "christmas tree baum natur",
  "🌲": "evergreen tree baum natur grün",
  "🌳": "deciduous tree baum natur",
  "🌴": "palm tree baum natur",
  "🪵": "wood",
  "🌱": "seedling",
  "🌿": "herb",
  "☘️": "shamrock",
  "🍀": "four leaf clover blatt natur",
  "🎍": "pine decoration",
  "🪴": "potted plant",
  "🎋": "tanabata tree baum natur",
  "🍃": "leaf fluttering in wind blatt natur",
  "🍂": "fallen leaf blatt natur",
  "🍁": "maple leaf blatt natur",
  "🍄": "mushroom",
  "🐚": "spiral shell",
  "🪨": "rock",
  "🌾": "ear of rice",
  "💐": "bouquet",
  "🌷": "tulip",
  "🌹": "rose",
  "🥀": "wilted flower blume natur",
  "🌺": "hibiscus",
  "🌸": "cherry blossom",
  "🌼": "blossom",
  "🌻": "sunflower blume natur sonne wetter",
  "🌞": "sun with face gesicht smiley mimik sonne wetter",
  "🌝": "full moon with face gesicht smiley mimik mond nacht",
  "🌛": "first quarter moon with face gesicht smiley mimik mond nacht",
  "🌜": "last quarter moon with face gesicht smiley mimik mond nacht",
  "🌚": "new moon with face gesicht smiley mimik mond nacht",
  "🌕": "full moon symbol mond nacht",
  "🌖": "waning gibbous moon symbol mond nacht",
  "🌗": "last quarter moon symbol mond nacht",
  "🌘": "waning crescent moon symbol mond nacht",
  "🌑": "new moon symbol mond nacht",
  "🌒": "waxing crescent moon symbol mond nacht",
  "🌓": "first quarter moon symbol mond nacht",
  "🌔": "waxing gibbous moon symbol mond nacht",
  "🌙": "crescent moon mond nacht",
  "🌎": "earth globe americas",
  "🌍": "earth globe europe africa",
  "🌏": "earth globe asia australia",
  "🪐": "ringed planet",
  "⭐": "white medium star stern weiß weiss",
  "🌟": "glowing star stern",
  "✨": "sparkles",
  "⚡": "high voltage sign",
  "☄️": "comet",
  "🔥": "fire feuer heiß",
  "🌪️": "cloud with tornado wolke wetter",
  "🌈": "rainbow regen wetter",
  "☀️": "black sun with rays sonne wetter schwarz",
  "🌤️": "white sun with small cloud sonne wetter wolke wetter weiß weiss",
  "⛅": "sun behind cloud sonne wetter wolke wetter",
  "🌥️": "white sun behind cloud sonne wetter wolke wetter weiß weiss",
  "☁️": "cloud wolke wetter",
  "🌦️": "white sun behind cloud with rain sonne wetter wolke wetter regen wetter weiß weiss",
  "🌧️": "cloud with rain wolke wetter regen wetter",
  "⛈️": "thunder cloud and rain wolke wetter regen wetter",
  "🌩️": "cloud with lightning wolke wetter licht lampe",
  "🌨️": "cloud with snow wolke wetter schnee wetter",
  "❄️": "snowflake schnee wetter",
  "☃️": "snowman mann mensch schnee wetter",
  "⛄": "snowman without snow mann mensch schnee wetter",
  "🌬️": "wind blowing face gesicht smiley mimik",
  "💧": "droplet",
  "☔": "umbrella with rain drops regen wetter",
  "☂️": "umbrella",
  "🌊": "water wave wasser",
  "🌫️": "fog",
  "🍏": "green apple apfel obst essen grün",
  "🍎": "red apple apfel obst essen rot",
  "🍐": "pear",
  "🍊": "tangerine",
  "🍋": "lemon",
  "🍌": "banana banane obst essen",
  "🍉": "watermelon wasser",
  "🍇": "grapes",
  "🍓": "strawberry",
  "🫐": "blueberries blau",
  "🍈": "melon",
  "🍒": "cherries",
  "🍑": "peach",
  "🥭": "mango mann mensch",
  "🍍": "pineapple apfel obst essen",
  "🥥": "coconut",
  "🥝": "kiwifruit",
  "🍅": "tomato",
  "🍆": "aubergine",
  "🥑": "avocado",
  "🥦": "broccoli",
  "🥬": "leafy green blatt natur grün",
  "🥒": "cucumber",
  "🌶️": "hot pepper heiß warm",
  "🫑": "bell pepper",
  "🌽": "ear of maize",
  "🥕": "carrot auto fahrzeug",
  "🫒": "olive",
  "🧄": "garlic",
  "🧅": "onion",
  "🥔": "potato",
  "🍠": "roasted sweet potato",
  "🫘": "beans",
  "🥐": "croissant",
  "🥯": "bagel",
  "🍞": "bread",
  "🥖": "baguette bread",
  "🥨": "pretzel",
  "🧀": "cheese wedge",
  "🥚": "egg",
  "🍳": "cooking ok gut",
  "🧈": "butter",
  "🥞": "pancakes kuchen torte geburtstag",
  "🧇": "waffle",
  "🥓": "bacon",
  "🥩": "cut of meat",
  "🍗": "poultry leg",
  "🍖": "meat on bone knochen",
  "🌭": "hot dog hund tier heiß warm",
  "🍔": "hamburger",
  "🍟": "french fries",
  "🍕": "slice of pizza pizza essen",
  "🫓": "flatbread",
  "🥪": "sandwich",
  "🥙": "stuffed flatbread",
  "🧆": "falafel",
  "🌮": "taco",
  "🌯": "burrito",
  "🫔": "tamale",
  "🥗": "green salad grün",
  "🥘": "shallow pan of food essen",
  "🫕": "fondue",
  "🥫": "canned food essen",
  "🍝": "spaghetti",
  "🍜": "steaming bowl eule tier",
  "🍲": "pot of food essen",
  "🍛": "curry and rice",
  "🍣": "sushi",
  "🍱": "bento box",
  "🥟": "dumpling",
  "🦪": "oyster",
  "🍤": "fried shrimp",
  "🍙": "rice ball ball sport",
  "🍚": "cooked rice ok gut",
  "🍘": "rice cracker",
  "🍥": "fish cake with swirl design fisch tier kuchen torte geburtstag",
  "🥠": "fortune cookie ok gut",
  "🥮": "moon cake mond nacht kuchen torte geburtstag",
  "🍢": "oden",
  "🍡": "dango",
  "🍧": "shaved ice",
  "🍨": "ice cream",
  "🍦": "soft ice cream",
  "🥧": "pie",
  "🧁": "cupcake kuchen torte geburtstag hoch",
  "🍰": "shortcake kuchen torte geburtstag",
  "🎂": "birthday cake kuchen torte geburtstag",
  "🍮": "custard stern",
  "🍭": "lollipop",
  "🍬": "candy",
  "🍫": "chocolate bar",
  "🍿": "popcorn",
  "🍩": "doughnut",
  "🍪": "cookie ok gut",
  "🌰": "chestnut",
  "🥜": "peanuts",
  "🍯": "honey pot",
  "🥛": "glass of milk",
  "🍼": "baby bottle baby kind",
  "☕": "hot beverage heiß warm",
  "🫖": "teapot",
  "🍵": "teacup without handle hand hoch",
  "🧃": "beverage box",
  "🥤": "cup with straw hoch",
  "🧋": "bubble tea",
  "🍶": "sake bottle and cup hoch",
  "🍺": "beer mug bier trinken",
  "🍻": "clinking beer mugs bier trinken",
  "🥂": "clinking glasses",
  "🍷": "wine glass wein trinken",
  "🥃": "tumbler glass",
  "🍸": "cocktail glass",
  "🍹": "tropical drink trinken",
  "🧉": "mate drink trinken",
  "🍾": "bottle with popping cork",
  "🧊": "ice cube",
  "🥄": "spoon",
  "🍴": "fork and knife",
  "🍽️": "fork and knife with plate",
  "🥣": "bowl with spoon eule tier",
  "🥡": "takeout box",
  "🥢": "chopsticks",
  "🧂": "salt shaker",
  "⚽": "soccer ball ball sport",
  "🏀": "basketball and hoop ball sport",
  "🏈": "american football fuß fuss ball sport",
  "⚾": "baseball ball sport",
  "🥎": "softball ball sport",
  "🎾": "tennis racquet and ball ball sport",
  "🏐": "volleyball ball sport",
  "🏉": "rugby football fuß fuss ball sport",
  "🥏": "flying disc",
  "🎱": "billiards",
  "🪀": "yo yo",
  "🏓": "table tennis paddle and ball ball sport",
  "🏸": "badminton racquet and shuttlecock",
  "🏒": "ice hockey stick and puck schlüssel",
  "🏑": "field hockey stick and ball ball sport schlüssel",
  "🥍": "lacrosse stick and ball kreuz x nein falsch löschen ball sport",
  "🏏": "cricket bat and ball ball sport",
  "🪃": "boomerang",
  "🥅": "goal net",
  "⛳": "flag in hole flagge fahne land",
  "🪁": "kite",
  "🏹": "bow and arrow pfeil",
  "🎣": "fishing pole and fish fisch tier",
  "🤿": "diving mask",
  "🥊": "boxing glove",
  "🥋": "martial arts uniform",
  "🎽": "running shirt with sash",
  "🛹": "skateboard",
  "🛼": "roller skate",
  "🛷": "sled",
  "⛸️": "ice skate",
  "🥌": "curling stone",
  "🎿": "ski and ski boot",
  "⛷️": "skier",
  "🏂": "snowboarder schnee wetter",
  "🪂": "parachute",
  "🏋️": "weight lifter",
  "🤼": "wrestlers",
  "🤸": "person doing cartwheel person mensch auto fahrzeug",
  "⛹️": "person with ball person mensch ball sport",
  "🤺": "fencer",
  "🤾": "handball hand ball sport",
  "🏌️": "golfer",
  "🏇": "horse racing pferd tier",
  "🏄": "surfer",
  "🏊": "swimmer",
  "🤽": "water polo wasser",
  "🚣": "rowboat",
  "🧗": "person climbing person mensch",
  "🚵": "mountain bicyclist",
  "🚴": "bicyclist",
  "🏆": "trophy",
  "🥇": "first place medal",
  "🥈": "second place medal",
  "🥉": "third place medal",
  "🏅": "sports medal sport",
  "🎖️": "military medal",
  "🏵️": "rosette",
  "🎗️": "reminder ribbon",
  "🎫": "ticket",
  "🎟️": "admission tickets",
  "🎪": "circus tent",
  "🤹": "juggling",
  "🎭": "performing arts",
  "🩰": "ballet shoes ball sport",
  "🎨": "artist palette",
  "🎬": "clapper board",
  "🎤": "microphone telefon handy",
  "🎧": "headphone telefon handy",
  "🎼": "musical score musik",
  "🎹": "musical keyboard musik schlüssel",
  "🥁": "drum with drumsticks",
  "🪘": "long drum",
  "🎷": "saxophone telefon handy",
  "🎺": "trumpet",
  "🪗": "accordion",
  "🎸": "guitar",
  "🪕": "banjo",
  "🎻": "violin",
  "🎲": "game die",
  "♟️": "black chess pawn schwarz",
  "🎯": "direct hit",
  "🎳": "bowling eule tier",
  "🎮": "video game",
  "🎰": "slot machine",
  "🧩": "jigsaw puzzle piece",
  "⌚": "watch",
  "📱": "mobile phone telefon handy",
  "📲": "mobile phone with rightwards arrow at left telefon handy pfeil links rechts",
  "💻": "personal computer person mensch computer laptop",
  "⌨️": "keyboard schlüssel",
  "🖥️": "desktop computer computer laptop",
  "🖨️": "printer",
  "🖱️": "three button mouse maus tier",
  "🖲️": "trackball ball sport",
  "🕹️": "joystick freude froh glücklich lustig",
  "🗜️": "compression",
  "💽": "minidisc",
  "💾": "floppy disk",
  "💿": "optical disc",
  "📀": "dvd",
  "📼": "videocassette",
  "📷": "camera",
  "📸": "camera with flash",
  "📹": "video camera",
  "🎥": "movie camera",
  "📽️": "film projector",
  "🎞️": "film frames",
  "📞": "telephone receiver telefon handy",
  "☎️": "black telephone telefon handy schwarz",
  "📟": "pager",
  "📠": "fax machine",
  "📺": "television",
  "📻": "radio",
  "🎙️": "studio microphone telefon handy",
  "🎚️": "level slider",
  "🎛️": "control knobs",
  "🧭": "compass",
  "⏱️": "stopwatch",
  "⏲️": "timer clock uhr zeit schloss",
  "⏰": "alarm clock uhr zeit schloss",
  "🕰️": "mantelpiece clock mann mensch uhr zeit schloss",
  "⌛": "hourglass",
  "⏳": "hourglass with flowing sand",
  "📡": "satellite antenna",
  "🔋": "battery",
  "🪫": "low battery",
  "🔌": "electric plug",
  "💡": "electric light bulb licht lampe",
  "🔦": "electric torch",
  "🕯️": "candle",
  "🪔": "diya lamp",
  "🧯": "fire extinguisher feuer heiß",
  "🛢️": "oil drum",
  "💸": "money with wings geld euro bezahlen",
  "💵": "banknote with dollar sign",
  "💴": "banknote with yen sign",
  "💶": "banknote with euro sign",
  "💷": "banknote with pound sign",
  "🪙": "coin",
  "💰": "money bag geld euro bezahlen",
  "💳": "credit card auto fahrzeug rot",
  "💎": "gem stone",
  "⚖️": "scales",
  "🪜": "ladder",
  "🧰": "toolbox",
  "🪛": "screwdriver",
  "🔧": "wrench",
  "🔨": "hammer",
  "⚒️": "hammer and pick",
  "🛠️": "hammer and wrench",
  "⛏️": "pick",
  "🪓": "axe",
  "🪚": "carpentry saw auto fahrzeug stift schreiben",
  "🔩": "nut and bolt",
  "⚙️": "gear",
  "🪤": "mouse trap maus tier",
  "🧱": "brick",
  "⛓️": "chains",
  "🧲": "magnet",
  "🔫": "pistol",
  "💣": "bomb",
  "🧨": "firecracker feuer heiß",
  "🔪": "hocho",
  "🗡️": "dagger knife",
  "⚔️": "crossed swords kreuz x nein falsch löschen",
  "🛡️": "shield",
  "🚬": "smoking symbol ok gut",
  "⚰️": "coffin",
  "🪦": "headstone",
  "⚱️": "funeral urn",
  "🏺": "amphora",
  "🔮": "crystal ball ball sport",
  "📿": "prayer beads",
  "🧿": "nazar amulet",
  "💈": "barber pole",
  "⚗️": "alembic",
  "🔭": "telescope",
  "🔬": "microscope",
  "🩹": "adhesive bandage",
  "🩺": "stethoscope",
  "💊": "pill tablette medizin",
  "💉": "syringe spritze medizin",
  "🩸": "drop of blood",
  "🧬": "dna double helix",
  "🦠": "microbe",
  "🧫": "petri dish",
  "🧪": "test tube",
  "🌡️": "thermometer",
  "🧹": "broom",
  "🪠": "plunger",
  "🧺": "basket",
  "🧻": "roll of paper",
  "🚽": "toilet",
  "🚰": "potable water symbol wasser",
  "🚿": "shower",
  "🛁": "bathtub badewanne bad",
  "🧼": "bar of soap seife",
  "🪥": "toothbrush zahn",
  "🪒": "razor",
  "🧽": "sponge",
  "🪣": "bucket",
  "🧴": "lotion bottle",
  "🛎️": "bellhop bell",
  "🔑": "key schlüssel",
  "🗝️": "old key schlüssel",
  "🚪": "door",
  "🪑": "chair",
  "🛋️": "couch and lamp",
  "🛏️": "bed bett schlafen",
  "🧸": "teddy bear bär tier",
  "🪆": "nesting dolls",
  "🖼️": "frame with picture",
  "🪞": "mirror",
  "🪟": "window",
  "🛍️": "shopping bags",
  "🛒": "shopping trolley",
  "🎁": "wrapped present",
  "🎈": "balloon ball sport",
  "🎏": "carp streamer auto fahrzeug",
  "🎀": "ribbon",
  "🪄": "magic wand",
  "🪅": "pinata",
  "🎊": "confetti ball ball sport konfetti party feiern",
  "🎉": "party popper party feiern",
  "🪩": "mirror ball ball sport",
  "📩": "envelope with downwards arrow above pfeil runter",
  "📨": "incoming envelope",
  "📧": "e mail symbol",
  "📥": "inbox tray",
  "📤": "outbox tray",
  "📦": "package",
  "🏷️": "label",
  "🪧": "placard auto fahrzeug",
  "📪": "closed mailbox with lowered flag flagge fahne land rot",
  "📫": "closed mailbox with raised flag flagge fahne land",
  "📬": "open mailbox with raised flag flagge fahne land stift schreiben",
  "📭": "open mailbox with lowered flag flagge fahne land rot stift schreiben",
  "📮": "postbox",
  "📯": "postal horn",
  "📜": "scroll",
  "📃": "page with curl",
  "📄": "page facing up hoch",
  "📑": "bookmark tabs buch ok gut",
  "🧾": "receipt",
  "📊": "bar chart",
  "📈": "chart with upwards trend hoch",
  "📉": "chart with downwards trend runter",
  "🗒️": "spiral note pad",
  "🗓️": "spiral calendar pad kalender datum",
  "📆": "tear off calendar träne weinen kalender datum",
  "📅": "calendar kalender datum",
  "🗑️": "wastebasket",
  "📇": "card index auto fahrzeug",
  "🗃️": "card file box auto fahrzeug",
  "🗳️": "ballot box with ballot ball sport",
  "🗄️": "file cabinet",
  "📋": "clipboard",
  "📁": "file folder alt opa oma",
  "📂": "open file folder alt opa oma stift schreiben",
  "🗂️": "card index dividers auto fahrzeug",
  "🗞️": "rolled up newspaper hoch",
  "📰": "newspaper",
  "📓": "notebook buch ok gut",
  "📔": "notebook with decorative cover buch ok gut",
  "📒": "ledger",
  "📕": "closed book buch ok gut",
  "📗": "green book grün buch ok gut",
  "📘": "blue book blau buch ok gut",
  "📙": "orange book orange buch ok gut",
  "📚": "books buch ok gut",
  "📖": "open book buch stift schreiben ok gut",
  "🔖": "bookmark buch ok gut",
  "🧷": "safety pin",
  "🔗": "link symbol",
  "📎": "paperclip",
  "🖇️": "linked paperclips lippen mund",
  "📐": "triangular ruler",
  "📏": "straight ruler",
  "🧮": "abacus",
  "📌": "pushpin",
  "📍": "round pushpin",
  "✂️": "black scissors schwarz schere",
  "🖊️": "lower left ballpoint pen ball sport stift schreiben links",
  "🖋️": "lower left fountain pen stift schreiben links",
  "✒️": "black nib schwarz",
  "🖌️": "lower left paintbrush links",
  "🖍️": "lower left crayon links",
  "📝": "memo",
  "✏️": "pencil stift schreiben stift schreiben",
  "🔍": "left pointing magnifying glass links",
  "🔎": "right pointing magnifying glass rechts",
  "🔏": "lock with ink pen schloss stift schreiben",
  "🔐": "closed lock with key schlüssel schloss",
  "🔒": "lock schloss",
  "🔓": "open lock schloss stift schreiben",
  "🚗": "automobile",
  "🚕": "taxi",
  "🚙": "recreational vehicle",
  "🚌": "bus bus fahrzeug",
  "🚎": "trolleybus bus fahrzeug",
  "🏎️": "racing car auto fahrzeug",
  "🚓": "police car auto fahrzeug",
  "🚑": "ambulance",
  "🚒": "fire engine feuer heiß",
  "🚐": "minibus bus fahrzeug",
  "🛻": "pickup truck hoch",
  "🚚": "delivery truck",
  "🚛": "articulated lorry",
  "🚜": "tractor",
  "🦯": "probing cane",
  "🦽": "manual wheelchair mann mensch",
  "🦼": "motorized wheelchair",
  "🛴": "scooter",
  "🚲": "bicycle",
  "🛵": "motor scooter",
  "🏍️": "racing motorcycle",
  "🛺": "auto rickshaw",
  "🚨": "police cars revolving light auto fahrzeug licht lampe",
  "🚔": "oncoming police car auto fahrzeug",
  "🚍": "oncoming bus bus fahrzeug",
  "🚘": "oncoming automobile",
  "🚖": "oncoming taxi",
  "🚡": "aerial tramway",
  "🚠": "mountain cableway",
  "🚟": "suspension railway stift schreiben",
  "🚃": "railway car auto fahrzeug",
  "🚋": "tram car auto fahrzeug",
  "🚞": "mountain railway",
  "🚝": "monorail",
  "🚄": "high speed train regen wetter zug bahn",
  "🚅": "high speed train with bullet nose regen wetter zug bahn",
  "🚈": "light rail licht lampe",
  "🚂": "steam locomotive",
  "🚆": "train regen wetter zug bahn",
  "🚇": "metro",
  "🚊": "tram",
  "🚉": "station",
  "✈️": "airplane flugzeug fliegen",
  "🛫": "airplane departure flugzeug fliegen",
  "🛬": "airplane arriving flugzeug fliegen",
  "🛩️": "small airplane flugzeug fliegen",
  "💺": "seat",
  "🛰️": "satellite",
  "🚀": "rocket rakete start",
  "🛸": "flying saucer",
  "🚁": "helicopter",
  "🛶": "canoe",
  "⛵": "sailboat",
  "🚤": "speedboat",
  "🛥️": "motor boat",
  "🛳️": "passenger ship",
  "⛴️": "ferry",
  "🚢": "ship",
  "⚓": "anchor",
  "🛟": "ring buoy",
  "🪝": "hook ok gut",
  "⛽": "fuel pump",
  "🚧": "construction sign",
  "🚦": "vertical traffic light licht lampe",
  "🚥": "horizontal traffic light licht lampe",
  "🚏": "bus stop bus fahrzeug",
  "🗺️": "world map",
  "🗿": "moyai",
  "🗽": "statue of liberty",
  "🗼": "tokyo tower ok gut",
  "🏰": "european castle europa eu flagge",
  "🏯": "japanese castle",
  "🏟️": "stadium",
  "🎡": "ferris wheel",
  "🎢": "roller coaster",
  "🎠": "carousel horse pferd tier auto fahrzeug",
  "⛲": "fountain",
  "⛱️": "umbrella on ground",
  "🏖️": "beach with umbrella",
  "🏝️": "desert island",
  "🏜️": "desert",
  "🌋": "volcano",
  "⛰️": "mountain",
  "🏔️": "snow capped mountain schnee wetter",
  "🗻": "mount fuji",
  "🏕️": "camping",
  "⛺": "tent",
  "🛖": "hut",
  "🏠": "house building haus gebäude gebäude haus",
  "🏡": "house with garden haus gebäude",
  "🏘️": "house buildings haus gebäude gebäude haus",
  "🏚️": "derelict house building haus gebäude gebäude haus",
  "🏗️": "building construction gebäude haus",
  "🏭": "factory",
  "🏢": "office building gebäude haus",
  "🏬": "department store",
  "🏣": "japanese post office",
  "🏤": "european post office europa eu flagge",
  "🏥": "hospital",
  "🏦": "bank",
  "🏨": "hotel heiß warm",
  "🏪": "convenience store",
  "🏫": "school",
  "🏩": "love hotel heiß warm",
  "💒": "wedding",
  "🏛️": "classical building gebäude haus",
  "⛪": "church",
  "🕌": "mosque",
  "🕍": "synagogue",
  "🛕": "hindu temple",
  "🕋": "kaaba",
  "⛩️": "shinto shrine",
  "🛤️": "railway track",
  "🛣️": "motorway",
  "🗾": "silhouette of japan",
  "🎑": "moon viewing ceremony mond nacht",
  "🏞️": "national park",
  "🌅": "sunrise sonne wetter",
  "🌄": "sunrise over mountains sonne wetter",
  "🌠": "shooting star stern",
  "🎇": "firework sparkler feuer heiß",
  "🎆": "fireworks feuer heiß",
  "🌇": "sunset over buildings sonne wetter gebäude haus",
  "🌆": "cityscape at dusk",
  "🏙️": "cityscape",
  "🌃": "night with stars stern",
  "🌌": "milky way",
  "🌉": "bridge at night",
  "🌁": "foggy",
  "✅": "white heavy check mark check erledigt ja ok richtig weiß weiss",
  "☑️": "ballot box with check check erledigt ja ok richtig ball sport",
  "✔️": "heavy check mark check erledigt ja ok richtig",
  "❌": "cross mark kreuz x nein falsch löschen",
  "❎": "negative squared cross mark kreuz x nein falsch löschen rot",
  "➕": "heavy plus sign",
  "➖": "heavy minus sign",
  "➗": "heavy division sign",
  "✖️": "heavy multiplication x katze tier",
  "🟰": "heavy equals sign",
  "♾️": "permanent paper sign mann mensch",
  "‼️": "double exclamation mark",
  "⁉️": "exclamation question mark",
  "❓": "black question mark ornament schwarz",
  "❔": "white question mark ornament weiß weiss",
  "❕": "white exclamation mark ornament weiß weiss",
  "❗": "heavy exclamation mark symbol",
  "〰️": "wavy dash",
  "💱": "currency exchange",
  "💲": "heavy dollar sign",
  "⚕️": "staff of aesculapius",
  "♻️": "black universal recycling symbol schwarz",
  "⚜️": "fleur de lis",
  "🔱": "trident emblem",
  "📛": "name badge",
  "🔰": "japanese symbol for beginner",
  "⭕": "heavy large circle",
  "🟢": "large green circle grün",
  "🟡": "large yellow circle gelb",
  "🟠": "large orange circle orange",
  "🔴": "large red circle rot",
  "🟣": "large purple circle lila violett",
  "🔵": "large blue circle blau",
  "⚫": "medium black circle schwarz",
  "⚪": "medium white circle weiß weiss",
  "🟤": "large brown circle braun",
  "⬛": "black large square schwarz",
  "⬜": "white large square weiß weiss",
  "◼️": "black medium square schwarz",
  "◻️": "white medium square weiß weiss",
  "◾": "black medium small square schwarz",
  "◽": "white medium small square weiß weiss",
  "▪️": "black small square schwarz",
  "▫️": "white small square weiß weiss",
  "🔶": "large orange diamond orange",
  "🔷": "large blue diamond blau",
  "🔸": "small orange diamond orange",
  "🔹": "small blue diamond blau",
  "🔺": "up pointing red triangle rot hoch",
  "🔻": "down pointing red triangle rot runter",
  "💠": "diamond shape with a dot inside",
  "🔘": "radio button",
  "🔳": "white square button weiß weiss",
  "🔲": "black square button schwarz",
  "🏁": "chequered flag flagge fahne land rot",
  "🚩": "triangular flag on post flagge fahne land",
  "🎌": "crossed flags kreuz x nein falsch löschen flagge fahne land",
  "🏴": "waving black flag flagge fahne land schwarz",
  "🏳️": "waving white flag flagge fahne land weiß weiss",
  "🏳️‍🌈": "waving white flag zero width joiner rainbow regen wetter flagge fahne land weiß weiss",
  "🏳️‍⚧️": "waving white flag zero width joiner male with stroke and male and female sign flagge fahne land weiß weiss ok gut",
  "🏴‍☠️": "waving black flag zero width joiner skull and crossbones kreuz x nein falsch löschen flagge fahne land schwarz knochen",
  "🇦🇹": "regional indicator symbol letter a regional indicator symbol letter t katze tier",
  "🇩🇪": "regional indicator symbol letter d regional indicator symbol letter e katze tier",
  "🇷🇴": "regional indicator symbol letter r regional indicator symbol letter o katze tier",
  "🇪🇺": "regional indicator symbol letter e regional indicator symbol letter u katze tier",
  "🇺🇸": "regional indicator symbol letter u regional indicator symbol letter s katze tier",
  "🇬🇧": "regional indicator symbol letter g regional indicator symbol letter b katze tier",
  "🇨🇭": "regional indicator symbol letter c regional indicator symbol letter h katze tier",
  "🇮🇹": "regional indicator symbol letter i regional indicator symbol letter t katze tier",
  "🇫🇷": "regional indicator symbol letter f regional indicator symbol letter r katze tier",
  "🇪🇸": "regional indicator symbol letter e regional indicator symbol letter s katze tier",
};

const EMOJI_GROUP_SEARCH_ALIASES: Record<string, string> = {
  Smileys: "smiley smileys gesicht mimik lachen lächeln weinen traurig glücklich froh wütend sauer krank müde überrascht verliebt kuss party",
  Gesten: "gesten hand hände körper daumen finger klatschen beten bitte danke ok nagel fuß fuss auge mund zahn körperteil",
  Herzen: "herzen herz liebe verliebt gefühl kuss symbol funke glitzer sprechblase gedanke schlafen",
  Menschen: "menschen person mensch mann frau kind baby beruf arzt kosmetik student künstler hochzeit könig weihnachten tanzen bad schlafen",
  "Tiere & Natur": "tiere natur tier hund katze maus hase vogel fisch blume pflanze baum sonne mond wetter regen schnee feuer wasser",
  Essen: "essen trinken obst gemüse brot pizza burger kaffee tee kuchen torte geburtstag glas flasche",
  Aktivität: "aktivität aktivitaet sport spiel musik feiern party kunst hobby ball medaille pokal",
  Objekte: "objekte ding werkzeug handy telefon computer geld geschenk kosmetik medizin schlüssel schloss lampe buch stift",
  Reisen: "reisen reise auto bus zug flugzeug boot haus gebäude ort hotel karte uhr zeit",
  Symbole: "symbole zeichen zahl pfeil check ok ja nein x frage ausrufezeichen warnung flagge fahne land",
};


const EMOJI_SEARCH_ALIAS_FIXES: Record<string, string> = {
  "😐": "neutral gelangweilt langweilig langeweile uninteressiert egal meh ausdruckslos",
  "😑": "ausdruckslos gelangweilt langweilig langeweile genervt egal meh",
  "😒": "unbeeindruckt gelangweilt langweilig langeweile genervt skeptisch meh",
  "🙄": "augenrollen genervt gelangweilt langweilig nervig",
  "🥱": "gaehnen gähnen muede müde langweilig langeweile schlaf schlafen",
  "😴": "schlafen muede müde sleepy zzz langweilig langeweile",
  "😪": "schlaefrig schläfrig muede müde schlafen langweilig",
  "💤": "zzz schlafen muede müde schlaf langweilig",
  "🐌": "schnecke langsam lang langweilig schleim tier",
  "🦥": "faultier langsam lang langweilig tier muede müde",
  "🚶": "gehen laufen spazieren langsam lang person mensch",
  "🚶‍♀️": "gehen laufen spazieren langsam lang frau mensch",
  "🚶‍♂️": "gehen laufen spazieren langsam lang mann mensch",

  "🥕": "karotte karotten moehre moehren möhre möhren carrot gemuese gemüse essen orange",
  "🍅": "tomate tomato gemuese gemüse essen rot",
  "🥦": "brokkoli broccoli gemuese gemüse essen gruen grün",
  "🥒": "gurke cucumber gemuese gemüse essen gruen grün",
  "🌽": "mais corn gemuese gemüse essen gelb",
  "🥔": "kartoffel potato essen gemuese gemüse",
  "🧅": "zwiebel onion essen gemuese gemüse",
  "🧄": "knoblauch garlic essen gemuese gemüse",
  "🍆": "aubergine eggplant gemuese gemüse essen lila",
  "🥑": "avocado essen gemuese gemüse gruen grün",
  "🥬": "salat blattsalat leafy green essen gemuese gemüse gruen grün",
  "🌶️": "chili paprika scharf pepper hot essen gemuese gemüse rot",
  "🫑": "paprika pepper essen gemuese gemüse",
  "🍏": "apfel gruen grün apple obst essen",
  "🍎": "apfel rot apple obst essen",
  "🍌": "banane banana obst essen gelb",
  "🍓": "erdbeere strawberry obst essen rot",
  "🍒": "kirsche kirschen cherries obst essen rot",
  "🍋": "zitrone lemon obst essen gelb",
  "🍊": "orange mandarine tangerine obst essen orange",
  "🍉": "wassermelone watermelon obst essen",
  "🍇": "trauben grapes obst essen lila",
  "🍐": "birne pear obst essen",
  "🍑": "pfirsich peach obst essen",
  "🍍": "ananas pineapple obst essen",
  "🥝": "kiwi kiwifruit obst essen gruen grün",
  "🥭": "mango obst essen",
  "🫐": "heidelbeeren blaubeeren blueberries obst essen blau",
  "🥥": "kokosnuss coconut obst essen",

  "🚗": "auto pkw car fahrzeug fahren reise rot",
  "🚙": "auto suv fahrzeug car fahren reise",
  "🚕": "taxi auto fahrzeug car fahren",
  "🚓": "polizei auto polizeiauto fahrzeug",
  "🚑": "krankenwagen rettung ambulance auto fahrzeug medizin",
  "🚒": "feuerwehr feuerwehrauto auto fahrzeug",
  "🚌": "bus autobus fahrzeug reisen",
  "🚎": "trolleybus bus fahrzeug",
  "🏎️": "rennwagen auto formel eins sport fahrzeug schnell",
  "🚚": "lieferwagen lkw truck paket fahrzeug",
  "🚛": "lkw truck lastwagen fahrzeug",
  "🚜": "traktor tractor fahrzeug",
  "🛻": "pickup auto fahrzeug truck",
  "🚲": "fahrrad bike rad fahrzeug",
  "🛵": "roller scooter moped fahrzeug",
  "🏍️": "motorrad motorcycle bike fahrzeug",
  "✈️": "flugzeug fliegen airplane reise urlaub",
  "🚀": "rakete rocket start fliegen",
  "🚂": "zug lokomotive bahn train reise",
  "🚆": "zug bahn train reise",
  "🚊": "strassenbahn straßenbahn tram zug reise",
  "🚁": "hubschrauber helicopter fliegen reise",

  "😀": "grinsen lachen smiley happy freude froh",
  "😃": "lachen smiley happy freude froh",
  "😄": "lachen smiley happy freude froh",
  "😁": "grinsen lachen smiley happy freude",
  "😂": "lachen lachen tränen traenen lustig lol freude",
  "🤣": "lachen lachflash tränen traenen lustig lol",
  "😊": "laecheln lächeln smiley happy zufrieden lieb",
  "🥰": "verliebt liebe herz happy",
  "😍": "verliebt liebe herz augen",
  "😭": "weinen heulen traurig traenen tränen cry",
  "😢": "weinen traurig traene träne cry",
  "😔": "traurig traurig traurig niedergeschlagen",
  "😡": "wuetend wütend sauer angry rot",
  "😠": "wuetend wütend sauer angry",
  "🤔": "denken nachdenken frage skeptisch überlegen",
  "🤷": "keine ahnung egal schultern zucken",
  "😮": "ueberrascht überrascht erstaunt wow offen mund",
  "😱": "schock angst erschrocken schreien",
  "🤢": "krank schlecht übel uebel gruen grün",
  "🤮": "kotzen erbrechen krank übel uebel",
  "🤒": "krank fieber thermometer",
  "😷": "krank maske medizin",
  "🥳": "party feiern geburtstag konfetti",

  "👍": "daumen hoch like gut ok ja passt top",
  "👎": "daumen runter schlecht nein dislike",
  "👌": "ok perfekt passt gut",
  "🙏": "bitte danke beten namaste",
  "👏": "klatschen applause bravo gut",
  "👋": "winken hallo bye tschuess tschüss",
  "🤝": "handshake hände schütteln deal vereinbarung",

  "❤️": "herz liebe rot verliebt love",
  "🧡": "herz orange liebe",
  "💛": "herz gelb liebe",
  "💚": "herz gruen grün liebe",
  "💙": "herz blau liebe",
  "💜": "herz lila violett liebe",
  "🖤": "herz schwarz liebe",
  "🤍": "herz weiss weiß liebe",
  "💔": "gebrochenes herz traurig liebe",
  "💕": "herzen liebe",
  "💞": "herzen liebe",
  "💋": "kuss küssen lippen liebe",

  "🐶": "hund dog tier",
  "🐕": "hund dog tier",
  "🐱": "katze cat tier",
  "🐈": "katze cat tier",
  "🐰": "hase kaninchen rabbit tier",
  "🐇": "hase kaninchen rabbit tier",
  "🐭": "maus mouse tier",
  "🐹": "hamster tier",
  "🦊": "fuchs fox tier",
  "🐻": "baer bär bear tier",
  "🐼": "panda tier",
  "🐨": "koala tier",
  "🐮": "kuh cow tier",
  "🐷": "schwein pig tier",
  "🐸": "frosch frog tier",
  "🐵": "affe monkey tier",
  "🐔": "huhn chicken tier",
  "🐦": "vogel bird tier",
  "🐧": "pinguin penguin tier",
  "🐴": "pferd horse tier",
  "🐝": "biene bee tier",
  "🦋": "schmetterling butterfly tier natur",
  "🐢": "schildkroete schildkröte turtle tier langsam",

  "☀️": "sonne sun wetter warm",
  "🌞": "sonne sun gesicht wetter warm",
  "🌙": "mond moon nacht",
  "⭐": "stern star favorit",
  "🌟": "stern star glitzer",
  "✨": "glitzer funkeln sparkle stern",
  "🔥": "feuer fire hot heiß heiss",
  "🌈": "regenbogen rainbow wetter",
  "🌧️": "regen rain wetter",
  "❄️": "schnee snow kalt wetter",
  "💧": "tropfen wasser water",

  "☕": "kaffee coffee trinken",
  "🍵": "tee tea trinken",
  "🍺": "bier beer trinken",
  "🍷": "wein wine trinken",
  "🥂": "prost sekt champagner feiern trinken",
  "🍰": "kuchen torte cake geburtstag essen",
  "🎂": "geburtstag kuchen torte cake party",
  "🍕": "pizza essen",
  "🍔": "burger hamburger essen",
  "🍟": "pommes fries essen",
  "🍣": "sushi essen",
  "🍝": "spaghetti pasta nudeln essen",

  "💰": "geld money bezahlen euro reich",
  "💶": "euro geld bezahlen",
  "💳": "karte kreditkarte bankomat bezahlen geld",
  "📞": "telefon phone anruf",
  "☎️": "telefon phone anruf",
  "📱": "handy smartphone telefon phone",
  "💻": "laptop computer pc",
  "🖥️": "computer monitor pc",
  "⌚": "uhr zeit watch",
  "⏰": "wecker uhr zeit alarm",
  "🔑": "schlüssel schluessel key",
  "🔒": "schloss lock gesperrt",
  "🔓": "offen entsperrt schloss",
  "🎁": "geschenk present geburtstag",
  "📌": "pin anheften merken",
  "✂️": "schere schneiden",
};

const EMOJI_QUERY_PREFERRED: Record<string, string[]> = {
  lang: ["😒", "😐", "😑", "🥱", "😴", "😪", "🐌", "🦥", "💤", "🚶", "🚶‍♀️", "🚶‍♂️"],
  langweilig: ["😒", "😐", "😑", "🥱", "😴", "😪", "🐌", "🦥", "💤", "🚶", "🚶‍♀️", "🚶‍♂️"],
  langeweile: ["😒", "😐", "😑", "🥱", "😴", "😪", "🐌", "🦥", "💤", "🚶", "🚶‍♀️", "🚶‍♂️"],
  langweilen: ["😒", "😐", "😑", "🥱", "😴", "😪", "🐌", "🦥", "💤", "🚶", "🚶‍♀️", "🚶‍♂️"],
  muede: ["🥱", "😴", "😪", "💤", "😫", "😩"],
  mude: ["🥱", "😴", "😪", "💤", "😫", "😩"],
  schlafen: ["😴", "💤", "😪", "🥱", "🛌"],
  weinen: ["😭", "😢", "🥲", "😥", "😿"],
  traurig: ["😔", "😢", "😭", "🙁", "☹️", "🥺"],
  lachen: ["😂", "🤣", "😄", "😁", "😆", "😀"],
  karotte: ["🥕"],
  karotten: ["🥕"],
  moehre: ["🥕"],
  moehren: ["🥕"],
  gemuese: ["🥕", "🥦", "🥒", "🍅", "🌽", "🥔", "🧅", "🧄", "🍆", "🥑", "🥬", "🌶️", "🫑"],
  gemuse: ["🥕", "🥦", "🥒", "🍅", "🌽", "🥔", "🧅", "🧄", "🍆", "🥑", "🥬", "🌶️", "🫑"],
  obst: ["🍎", "🍏", "🍌", "🍓", "🍒", "🍋", "🍊", "🍉", "🍇", "🍐", "🍑", "🍍", "🥝", "🥭", "🫐", "🥥"],
  auto: ["🚗", "🚙", "🚕", "🚓", "🚑", "🚒", "🏎️", "🛻", "🚚", "🚛", "🚜"],
  autos: ["🚗", "🚙", "🚕", "🚓", "🚑", "🚒", "🏎️", "🛻", "🚚", "🚛", "🚜"],
  pkw: ["🚗", "🚙", "🚕"],
  fahrzeug: ["🚗", "🚙", "🚕", "🚓", "🚑", "🚒", "🚌", "🚎", "🏎️", "🚚", "🚛", "🚜", "🚲", "🛵", "🏍️"],
  bus: ["🚌", "🚎", "🚐"],
  zug: ["🚂", "🚆", "🚊", "🚉"],
  flugzeug: ["✈️", "🛩️", "🛫", "🛬"],
  herz: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💞", "💓", "💗"],
  liebe: ["❤️", "🥰", "😍", "😘", "💕", "💞", "💋"],
  danke: ["🙏", "🙌", "👏", "👍", "🤝"],
  ok: ["👌", "👍", "✅", "🙆"],
  ja: ["👍", "👌", "✅", "☑️"],
  nein: ["👎", "❌", "✖️", "🙅"],
  hund: ["🐶", "🐕", "🦮", "🐕‍🦺", "🐩"],
  katze: ["🐱", "🐈", "🐈‍⬛", "😺", "😸", "😹", "😻", "😿"],
  kaffee: ["☕"],
  geburtstag: ["🎂", "🍰", "🥳", "🎉", "🎁", "🎈"],
  party: ["🥳", "🎉", "🎊", "🍾", "🥂", "🎈"],
  geld: ["💰", "💶", "💳", "💸", "🪙"],
  telefon: ["📞", "☎️", "📱"],
  handy: ["📱", "🤳"],
  sonne: ["☀️", "🌞", "🌅", "🌄"],
  mond: ["🌙", "🌕", "🌝", "🌚"],
  feuer: ["🔥", "🚒"],
};

function normalizeEmojiSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[︎️]/g, "")
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^\p{L}\p{N}\p{Emoji_Presentation}\p{Extended_Pictographic}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandEmojiSearchQuery(query: string) {
  const normalized = normalizeEmojiSearchValue(query);
  const synonyms: Record<string, string> = {
    lang: "langweilig langeweile langsam muede mude schlafen bored boring slow tired sleepy",
    langweilig: "langweilig langeweile gelangweilt langsam muede mude schlafen bored boring slow tired sleepy",
    langeweile: "langweilig langeweile gelangweilt langsam muede mude schlafen bored boring slow tired sleepy",
    weinen: "weinen traurig traenen traene cry crying",
    heulen: "weinen traurig traenen traene cry crying",
    lachen: "lachen lach smile smiley happy haha lol freude lustig",
    traurig: "traurig weinen ungluecklich sad",
    sauer: "sauer wuetend angry",
    wut: "wuetend sauer angry",
    liebe: "liebe herz kuss verliebt love heart",
    danke: "danke bitte beten thanks pray",
    daumen: "daumen thumb like gut schlecht",
    ok: "ok check ja gut passt erledigt",
    nein: "nein x falsch schlecht cross",
    hund: "hund dog tier",
    katze: "katze cat tier",
    kaffee: "kaffee coffee trinken",
    geburtstag: "geburtstag kuchen torte party",
    party: "party feiern konfetti geburtstag",
    geld: "geld euro bezahlen money",
    telefon: "telefon handy phone",
    handy: "handy telefon phone",
    auto: "auto pkw car fahrzeug fahren",
    autos: "auto pkw car fahrzeug fahren",
    karotte: "karotte karotten moehre moehren carrot gemuese essen",
    karotten: "karotte karotten moehre moehren carrot gemuese essen",
    moehre: "karotte karotten moehre moehren carrot gemuese essen",
    gemuese: "gemuese gemuse karotte tomate brokkoli gurke paprika mais kartoffel",
    gemuse: "gemuese gemuse karotte tomate brokkoli gurke paprika mais kartoffel",
    flugzeug: "flugzeug airplane fliegen",
    sonne: "sonne sun wetter",
    mond: "mond moon nacht",
    stern: "stern star favorit",
    feuer: "feuer fire heiss hot",
    blume: "blume flower natur",
    herz: "herz liebe love heart",
  };
  return normalizeEmojiSearchValue(`${normalized} ${synonyms[normalized] ?? ""}`);
}

function getPreferredEmojiSet(query: string) {
  const normalized = normalizeEmojiSearchValue(query);
  const preferred = new Set<string>();

  if (!normalized) return preferred;

  for (const [keyword, emojis] of Object.entries(EMOJI_QUERY_PREFERRED)) {
    const normalizedKeyword = normalizeEmojiSearchValue(keyword);

    if (
      normalized === normalizedKeyword ||
      normalized.includes(normalizedKeyword) ||
      (normalized.length >= 3 && normalizedKeyword.startsWith(normalized))
    ) {
      emojis.forEach((emoji) => preferred.add(emoji));
    }
  }

  return preferred;
}

function getEmojiSearchTokens(query: string) {
  const normalized = expandEmojiSearchQuery(query);
  return Array.from(
    new Set(
      normalized
        .split(" ")
        .map((word) => word.trim())
        .filter((word) => word.length >= 2),
    ),
  );
}

function getEmojiBaseAlias(emoji: string) {
  return EMOJI_SEARCH_ALIAS_FIXES[emoji] ?? EMOJI_SEARCH_ALIASES[emoji] ?? "";
}

function getEmojiSearchText(emoji: string, groupLabel: string) {
  return normalizeEmojiSearchValue(
    [
      emoji,
      groupLabel,
      getEmojiBaseAlias(emoji),
      EMOJI_UNICODE_SEARCH_ALIASES[emoji] ?? "",
    ].join(" "),
  );
}

function getEmojiMatchScore(
  emoji: string,
  groupLabel: string,
  query: string,
  preferredEmojiSet: Set<string>,
) {
  const normalizedQuery = normalizeEmojiSearchValue(query);
  if (!normalizedQuery) return 1;

  const searchText = getEmojiSearchText(emoji, groupLabel);
  const tokens = getEmojiSearchTokens(query);
  let score = 0;

  if (preferredEmojiSet.has(emoji)) score += 1000;
  if (searchText.includes(normalizedQuery)) score += 120;

  const rawWords = normalizedQuery.split(" ").filter((word) => word.length >= 2);
  rawWords.forEach((word) => {
    if (searchText.includes(word)) score += 90;
  });

  let synonymHits = 0;
  tokens.forEach((word) => {
    if (searchText.includes(word)) synonymHits += 1;
  });
  score += Math.min(synonymHits, 6) * 18;

  const groupAliases = normalizeEmojiSearchValue(
    `${groupLabel} ${EMOJI_GROUP_SEARCH_ALIASES[groupLabel] ?? ""}`,
  );
  if (rawWords.some((word) => groupAliases.split(" ").includes(word))) {
    score += 8;
  }

  return score;
}

function getEmojiSortIndex(emoji: string) {
  const index = ALL_PICKER_EMOJIS.indexOf(emoji);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(fileType?: string | null) {
  return Boolean(fileType && fileType.startsWith("image/"));
}

function getInitials(name: string) {
  if (!name) return "T";

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0][0]?.toUpperCase() ?? "T";
  }

  return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
}

function getAvatarColor(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.includes("radu")) {
    return "#3F51B5";
  }

  if (normalized.includes("raluca")) {
    return "#7B1FA2";
  }

  if (normalized.includes("alexandra")) {
    return "#0A8F08";
  }

  if (normalized.includes("barbara")) {
    return "#F57C00";
  }

  return "#6366F1";
}

function isSameGroup(
  a: ChatMessageDTO | undefined,
  b: ChatMessageDTO | undefined,
) {
  if (!a || !b) return false;
  if (a.senderId !== b.senderId) return false;

  const diff = Math.abs(
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return diff <= 5 * 60 * 1000;
}

function groupReactions(
  reactions: ReactionRow[],
  currentUserId: string,
): ReactionGroup[] {
  const grouped = new Map<string, ReactionGroup>();

  for (const reaction of reactions) {
    const existing = grouped.get(reaction.emoji);

    if (existing) {
      existing.count += 1;
      if (reaction.user_id === currentUserId) {
        existing.reactedByMe = true;
      }
    } else {
      grouped.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        reactedByMe: reaction.user_id === currentUserId,
      });
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => getEmojiSortIndex(a.emoji) - getEmojiSortIndex(b.emoji),
  );
}

function autoResizeTextarea(
  textarea: HTMLTextAreaElement | null,
  maxHeight = 160,
) {
  if (!textarea) return;
  textarea.style.height = "44px";
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, 44), maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function getReplyPreview(message: ChatMessageDTO) {
  const text = message.text?.trim();
  if (text) {
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }

  if (message.fileName) {
    return `📎 ${message.fileName}`;
  }

  return "Nachricht";
}

function buildReplyMessage(replyTarget: ReplyTarget | null, text: string) {
  if (!replyTarget) return text;

  const preview = replyTarget.text?.trim()
    ? replyTarget.text.trim()
    : replyTarget.fileName
      ? `📎 ${replyTarget.fileName}`
      : "Nachricht";

  const shortPreview =
    preview.length > 80 ? `${preview.slice(0, 80)}…` : preview;
  const replyHeader = `↪ Antwort auf ${replyTarget.senderName}: ${shortPreview}`;

  return text ? `${replyHeader}\n${text}` : replyHeader;
}

function parseReplyMessage(text: string): ParsedReplyMessage {
  const normalized = String(text ?? "");
  const match = normalized.match(
    /^↪ Antwort auf (.+?): ([^\n]*)(?:\n([\s\S]*))?$/,
  );

  if (!match) {
    return {
      isReply: false,
      replySender: "",
      replyPreview: "",
      bodyText: normalized,
    };
  }

  return {
    isReply: true,
    replySender: (match[1] ?? "").trim(),
    replyPreview: (match[2] ?? "").trim(),
    bodyText: (match[3] ?? "").trim(),
  };
}

function normalizeMentionValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getMentionInsertValue(fullName: string) {
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName.trim();
  return `@${firstName}:`;
}

function getMentionMatch(
  value: string,
  caretPosition?: number | null,
): MentionState {
  const caret =
    typeof caretPosition === "number" && caretPosition >= 0
      ? caretPosition
      : value.length;

  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/);

  if (!match || match.index == null) {
    return {
      active: false,
      query: "",
      startIndex: -1,
      endIndex: -1,
    };
  }

  const fullMatch = match[0];
  const atIndex = beforeCaret.lastIndexOf("@", match.index + fullMatch.length);

  if (atIndex < 0) {
    return {
      active: false,
      query: "",
      startIndex: -1,
      endIndex: -1,
    };
  }

  return {
    active: true,
    query: match[2] ?? "",
    startIndex: atIndex,
    endIndex: caret,
  };
}

function renderTextWithMentions(text: string, mine: boolean) {
  const parts = String(text ?? "").split(/(@[A-Za-zÀ-ÿ0-9._-]+:?)/g);

  return parts.map((part, index) => {
    if (/^@[A-Za-zÀ-ÿ0-9._-]+:?$/.test(part)) {
      const rawName = part.replace(/^@/, "").replace(/:$/, "");
      const color = getAvatarColor(rawName);

      return (
        <span
          key={`${part}-${index}`}
          className="inline-flex rounded-md border px-1.5 py-0.5 font-semibold"
          style={{
            borderColor: color,
            backgroundColor: mine ? `${color}33` : `${color}22`,
            color: mine ? "#111111" : color,
          }}
        >
          {part}
        </span>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function upsertMentionUser(
  map: Map<string, MentionUser>,
  userId: unknown,
  fullName: unknown,
) {
  const normalizedUserId = String(userId ?? "").trim();
  const normalizedFullName = String(fullName ?? "").trim();

  if (!normalizedUserId || !normalizedFullName) return;

  const existing = map.get(normalizedUserId);

  if (!existing) {
    map.set(normalizedUserId, {
      userId: normalizedUserId,
      fullName: normalizedFullName,
    });
    return;
  }

  if (
    existing.fullName.length <= 1 ||
    normalizeMentionValue(existing.fullName) ===
      normalizeMentionValue(existing.userId)
  ) {
    map.set(normalizedUserId, {
      userId: normalizedUserId,
      fullName: normalizedFullName,
    });
  }
}

function EmojiPicker({
  onSelect,
  onClose,
  title = "Emoji auswählen",
}: {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = useMemo(() => normalizeEmojiSearchValue(query), [query]);
  const preferredEmojiSet = useMemo(() => getPreferredEmojiSet(query), [query]);

  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return EMOJI_GROUPS;

    return EMOJI_GROUPS.map((group) => ({
      ...group,
      emojis: group.emojis
        .map((emoji) => ({
          emoji,
          score: getEmojiMatchScore(emoji, group.label, query, preferredEmojiSet),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return getEmojiSortIndex(a.emoji) - getEmojiSortIndex(b.emoji);
        })
        .map((item) => item.emoji),
    })).filter((group) => group.emojis.length > 0);
  }, [normalizedQuery, preferredEmojiSet, query]);

  return (
    <div className="flex max-h-[min(82dvh,690px)] w-[min(92vw,430px)] flex-col overflow-hidden rounded-[28px] border border-[#d8c1a0]/18 bg-[#1b1511]/95 shadow-[0_24px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#d8c1a0]/70">
            {title}
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] text-lg text-white/85 transition-colors hover:bg-[#d8c1a0]/[0.10] hover:text-white"
            aria-label="Emoji-Auswahl schließen"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="px-5 pb-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Emoji suchen oder auswählen…"
          className="h-11 w-full rounded-[16px] border border-[#d8c1a0]/16 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/35 transition focus:border-[#d8c1a0]/45 focus:bg-black/25"
        />
      </div>

      <div className="mx-5 mb-5 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[#d8c1a0]/12 bg-black/20 p-3 [scrollbar-color:rgba(216,193,160,0.45)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d8c1a0]/45 hover:[&::-webkit-scrollbar-thumb]:bg-[#d8c1a0]/65">
        {visibleGroups.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-white/45">
            Kein Emoji gefunden.
          </div>
        ) : null}

        {visibleGroups.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.20em] text-[#d8c1a0]/55">
              {group.label}
            </div>
            <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-8">
              {group.emojis.map((emoji, index) => (
                <button
                  key={`${group.label}-${emoji}-${index}`}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  className="inline-flex aspect-square w-full items-center justify-center rounded-[14px] border border-transparent text-[22px] transition hover:border-white/10 hover:bg-white/[0.08] active:scale-95"
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmojiMiniSlideover({
  title,
  onSelect,
  onClose,
}: {
  title: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[7px]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <EmojiPicker title={title} onClose={onClose} onSelect={onSelect} />
    </div>,
    document.body,
  );
}

const ChatMessageItem = memo(function ChatMessageItem({
  message,
  prevMessage,
  currentUserId,
  currentUserName,
  reactions,
  editingMessageId,
  editingText,
  onEditingTextChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onToggleReaction,
  openReactionPickerMessageId,
  onOpenReactionPicker,
  onCloseEmojiPicker,
  onOpenPreviewImage,
  onSwipeReply,
  onJumpToReplySource,
  editTextareaRef,
  messageRef,
  isHighlighted,
}: {
  message: ChatMessageDTO;
  prevMessage?: ChatMessageDTO;
  currentUserId: string;
  currentUserName: string;
  reactions: ReactionRow[];
  editingMessageId: string | null;
  editingText: string;
  onEditingTextChange: (value: string) => void;
  onSaveEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (message: ChatMessageDTO) => void;
  onDelete: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  openReactionPickerMessageId: string | null;
  onOpenReactionPicker: (messageId: string) => void;
  onCloseEmojiPicker: () => void;
  onOpenPreviewImage: (image: PreviewImage) => void;
  onSwipeReply: (message: ChatMessageDTO) => void;
  onJumpToReplySource: (parsedReply: ParsedReplyMessage) => void;
  editTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  messageRef: (node: HTMLDivElement | null) => void;
  isHighlighted: boolean;
}) {
  const mine = message.senderId === currentUserId;
  const name = message.senderName || (mine ? currentUserName : "Team");
  const showHeader = !isSameGroup(prevMessage, message);
  const reactionGroups = groupReactions(reactions, currentUserId);
  const reactionPickerOpen = openReactionPickerMessageId === message.id;
  const isDeleted = Boolean(message.deletedAt);
  const isEditing = editingMessageId === message.id;
  const hasAttachment = Boolean(message.fileUrl && message.fileName);
  const parsedReply = parseReplyMessage(message.text ?? "");
  const messageHasVisibleText = Boolean(
    (parsedReply.isReply ? parsedReply.bodyText : message.text)?.trim(),
  );

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [replyHintVisible, setReplyHintVisible] = useState(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const swipeLockRef = useRef<"x" | "y" | null>(null);
  const didTriggerReplyRef = useRef(false);

  const resetSwipe = useCallback(() => {
    setSwipeOffset(0);
    setReplyHintVisible(false);
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    swipeLockRef.current = null;
    didTriggerReplyRef.current = false;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isEditing || isDeleted) return;
      if (e.touches.length !== 1) return;

      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      swipeLockRef.current = null;
      didTriggerReplyRef.current = false;
    },
    [isDeleted, isEditing],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isEditing || isDeleted) return;
      if (e.touches.length !== 1) return;
      if (touchStartXRef.current == null || touchStartYRef.current == null)
        return;

      const dx = e.touches[0].clientX - touchStartXRef.current;
      const dy = e.touches[0].clientY - touchStartYRef.current;

      if (!swipeLockRef.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        swipeLockRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }

      if (swipeLockRef.current !== "x") return;
      if (dx <= 0) {
        setSwipeOffset(0);
        setReplyHintVisible(false);
        return;
      }

      const nextOffset = Math.min(dx, 72);
      setSwipeOffset(nextOffset);
      setReplyHintVisible(nextOffset > 20);

      if (nextOffset > 54 && !didTriggerReplyRef.current) {
        didTriggerReplyRef.current = true;
        onSwipeReply(message);
      }
    },
    [isDeleted, isEditing, message, onSwipeReply],
  );

  const handleTouchEnd = useCallback(() => {
    resetSwipe();
  }, [resetSwipe]);

  return (
    <div
      ref={messageRef}
      className={
        "flex gap-3 rounded-2xl py-1 transition-all duration-500 " +
        (isHighlighted ? "bg-indigo-500/10 ring-1 ring-indigo-400/40" : "")
      }
    >
      {showHeader ? (
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: getAvatarColor(name) }}
          title={name}
        >
          {getInitials(name)}
        </div>
      ) : (
        <div className="w-9 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        {showHeader ? (
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white">
              {mine ? "Du" : name}
            </span>
            <span className="text-xs text-white/40">
              {formatTime(message.createdAt)}
            </span>
            {message.editedAt && !message.deletedAt ? (
              <span className="text-[10px] italic text-white/30">
                (bearbeitet)
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="relative">
          {replyHintVisible ? (
            <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] text-white/80 backdrop-blur">
              ↪ Antworten
            </div>
          ) : null}

          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            style={{
              transform: swipeOffset
                ? `translateX(${swipeOffset}px)`
                : undefined,
              transition: swipeOffset === 0 ? "transform 160ms ease" : "none",
            }}
          >
            {isEditing ? (
              <div className="rounded-[16px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] p-2">
                <textarea
                  ref={editTextareaRef}
                  value={editingText}
                  onChange={(e) => onEditingTextChange(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 transition focus:border-[#d8c1a0]/45 focus:bg-black/30"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSaveEdit(message.id)}
                    className="rounded-lg border border-[#d8c1a0]/45 bg-[#d8c1a0]/18 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d8c1a0]/28"
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white hover:bg-white/[0.08]"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {isDeleted ? (
                  <div
                    className="rounded-[16px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] px-3 py-2 text-sm italic leading-6 text-white/40"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    Nachricht gelöscht
                  </div>
                ) : (
                  <>
                    {parsedReply.isReply || messageHasVisibleText ? (
                      <div
                        className={
                          "rounded-xl px-3 py-2 text-sm leading-6 " +
                          (mine
                            ? "border border-[#d8c1a0]/24 bg-[#d8c1a0]/[0.16] text-[#f6f0e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                            : "border border-white/10 bg-white/[0.055] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]")
                        }
                      >
                        {parsedReply.isReply ? (
                          <button
                            type="button"
                            onClick={() => onJumpToReplySource(parsedReply)}
                            className={
                              "mb-2 block w-full rounded-lg border-l-4 px-3 py-2 text-left transition " +
                              (mine
                                ? "border-[#d8c1a0]/45 bg-black/15 hover:bg-black/20"
                                : "border-[#d8c1a0]/45 bg-[#d8c1a0]/[0.045] hover:bg-[#d8c1a0]/[0.10]")
                            }
                          >
                            <div
                              className={
                                "text-[11px] font-semibold " +
                                (mine ? "text-[#d8c1a0]" : "text-indigo-200")
                              }
                            >
                              {parsedReply.replySender}
                            </div>
                            <div
                              className={
                                "mt-0.5 text-xs leading-5 " +
                                (mine ? "text-white/62" : "text-white/60")
                              }
                              style={{ whiteSpace: "pre-wrap" }}
                            >
                              {renderTextWithMentions(
                                parsedReply.replyPreview || "Nachricht",
                                mine,
                              )}
                            </div>
                          </button>
                        ) : null}

                        {messageHasVisibleText ? (
                          <div style={{ whiteSpace: "pre-wrap" }}>
                            {renderTextWithMentions(
                              parsedReply.isReply
                                ? parsedReply.bodyText
                                : message.text,
                              mine,
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {hasAttachment ? (
                      isImage(message.fileType) ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenPreviewImage({
                              url: message.fileUrl || "",
                              name: message.fileName || "Bild",
                            })
                          }
                          className={
                            "block w-full overflow-hidden rounded-xl border text-left text-sm transition " +
                            (mine
                              ? "border-[#d8c1a0]/24 bg-[#d8c1a0]/[0.14] text-white hover:bg-[#d8c1a0]/[0.18]"
                              : "border-white/10 bg-white/5 text-white hover:bg-[#d8c1a0]/[0.10]")
                          }
                        >
                          <img
                            src={message.fileUrl || ""}
                            alt={message.fileName || "Bild"}
                            className="max-h-72 w-full object-cover"
                          />

                          <div className="flex items-center justify-between gap-3 px-3 py-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {message.fileName}
                              </div>
                              <div
                                className={
                                  "mt-1 text-xs " +
                                  (mine ? "text-white/62" : "text-white/50")
                                }
                              >
                                {message.fileType || "Datei"}
                                {message.fileSize
                                  ? ` • ${formatFileSize(message.fileSize)}`
                                  : ""}
                              </div>
                            </div>

                            <div
                              className={
                                "shrink-0 rounded-lg px-2 py-1 text-xs font-semibold " +
                                (mine
                                  ? "bg-[#d8c1a0]/16 text-white"
                                  : "bg-white/10 text-white")
                              }
                            >
                              Vollbild
                            </div>
                          </div>
                        </button>
                      ) : (
                        <a
                          href={message.fileUrl || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={
                            "block overflow-hidden rounded-xl border text-sm transition " +
                            (mine
                              ? "border-[#d8c1a0]/24 bg-[#d8c1a0]/[0.14] text-white hover:bg-[#d8c1a0]/[0.18]"
                              : "border-white/10 bg-white/5 text-white hover:bg-[#d8c1a0]/[0.10]")
                          }
                        >
                          <div className="flex items-center justify-between gap-3 px-3 py-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {message.fileName}
                              </div>
                              <div
                                className={
                                  "mt-1 text-xs " +
                                  (mine ? "text-white/62" : "text-white/50")
                                }
                              >
                                {message.fileType || "Datei"}
                                {message.fileSize
                                  ? ` • ${formatFileSize(message.fileSize)}`
                                  : ""}
                              </div>
                            </div>

                            <div
                              className={
                                "shrink-0 rounded-lg px-2 py-1 text-xs font-semibold " +
                                (mine
                                  ? "bg-[#d8c1a0]/16 text-white"
                                  : "bg-white/10 text-white")
                              }
                            >
                              Öffnen
                            </div>
                          </div>
                        </a>
                      )
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {!isDeleted && !isEditing ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSwipeReply(message)}
              className="inline-flex text-xs text-white/60 hover:text-white"
              title="Antworten"
            >
              ↩ Antworten
            </button>

            {mine ? (
              <>
                <button
                  type="button"
                  onClick={() => onStartEdit(message)}
                  className="text-xs text-white/50 hover:text-white"
                >
                  ✏️ Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(message.id)}
                  className="text-xs text-red-300 hover:text-red-200"
                >
                  🗑 Löschen
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {!isDeleted ? (
          <div
            className="mt-2 -mx-1 overflow-x-auto px-1 pb-1"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex min-w-max items-center gap-2">
              {reactionGroups.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  onClick={() => onToggleReaction(message.id, reaction.emoji)}
                  className={
                    "shrink-0 inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition sm:min-h-8 sm:px-2 sm:py-1 " +
                    (reaction.reactedByMe
                      ? "border-white/30 bg-white/20 text-white"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-[#d8c1a0]/[0.10]")
                  }
                >
                  <span className="text-sm">{reaction.emoji}</span>
                  <span>{reaction.count}</span>
                </button>
              ))}

              {QUICK_REACTION_EMOJIS.map((emoji) => (
                <button
                  key={`${message.id}-${emoji}`}
                  type="button"
                  onClick={() => onToggleReaction(message.id, emoji)}
                  className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.055] text-base text-white/80 transition hover:bg-[#d8c1a0]/[0.10] sm:h-8 sm:w-8 sm:text-sm"
                  title={`Mit ${emoji} reagieren`}
                >
                  {emoji}
                </button>
              ))}

              <button
                type="button"
                onClick={() => onOpenReactionPicker(message.id)}
                className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.055] text-base text-white/80 transition hover:bg-[#d8c1a0]/[0.10] sm:h-8 sm:w-8 sm:text-sm"
                title="Weitere Emojis"
              >
                +
              </button>
            </div>

            {reactionPickerOpen ? (
              <EmojiMiniSlideover
                title="Reaktion auswählen"
                onClose={onCloseEmojiPicker}
                onSelect={(emoji) => {
                  onToggleReaction(message.id, emoji);
                  onCloseEmojiPicker();
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default function ChatClient({
  tenantId,
  currentUserId,
  currentUserName,
  initialMessages,
  embedded = false,
  onRealtimeStatusChange,
}: {
  tenantId: string | null;
  currentUserId: string;
  currentUserName: string;
  initialMessages: ChatMessageDTO[];
  embedded?: boolean;
  onRealtimeStatusChange?: (status: RealtimeStatus) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [reactionsByMessage, setReactionsByMessage] = useState<
    Record<string, ReactionRow[]>
  >({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(
    null,
  );
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionState, setMentionState] = useState<MentionState>({
    active: false,
    query: "",
    startIndex: -1,
    endIndex: -1,
  });
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>("connecting");
  const [openReactionPickerMessageId, setOpenReactionPickerMessageId] =
    useState<string | null>(null);
  const [composerEmojiPickerOpen, setComposerEmojiPickerOpen] = useState(false);
  const [mobileComposerMenuOpen, setMobileComposerMenuOpen] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [autoScroll, setAutoScroll] = useState(true);

  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hasFetchedRealtimeFallbackRef = useRef(false);

  const storageKey = useMemo(() => {
    if (!tenantId || !currentUserId) return null;
    return `team-chat:last-read:${tenantId}:${currentUserId}`;
  }, [tenantId, currentUserId]);

  const filteredMentionUsers = useMemo(() => {
    if (!mentionState.active) return [];

    const q = normalizeMentionValue(mentionState.query);

    const filtered = mentionUsers.filter((user) => {
      const full = normalizeMentionValue(user.fullName);
      const first = normalizeMentionValue(user.fullName.split(/\s+/)[0] ?? "");

      if (!q) return true;

      return full.includes(q) || first.startsWith(q);
    });

    return filtered.slice(0, 6);
  }, [mentionState.active, mentionState.query, mentionUsers]);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionState.query]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const mergeMessages = useCallback((incoming: ChatMessageDTO[]) => {
    setMessages((prev) => {
      const map = new Map<string, ChatMessageDTO>();

      for (const msg of prev) {
        map.set(String(msg.id), msg);
      }

      for (const msg of incoming) {
        map.set(String(msg.id), msg);
      }

      return Array.from(map.values()).sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
  }, []);

  const collectMessageIds = useCallback(
    (incomingMessages?: ChatMessageDTO[]) => {
      const source = incomingMessages ?? messages;
      const ids = source
        .map((message) => String(message.id ?? "").trim())
        .filter(Boolean);

      return Array.from(new Set(ids));
    },
    [messages],
  );

  const setReactionRow = useCallback((row: ReactionRow) => {
    setReactionsByMessage((prev) => {
      const current = prev[row.message_id] ?? [];
      const exists = current.some((r) => r.id === row.id);

      return {
        ...prev,
        [row.message_id]: exists ? current : [...current, row],
      };
    });
  }, []);

  const removeReactionRow = useCallback((rowId: string) => {
    setReactionsByMessage((prev) => {
      const next: Record<string, ReactionRow[]> = {};

      for (const [messageId, rows] of Object.entries(prev) as Array<
        [string, ReactionRow[]]
      >) {
        const filtered = rows.filter((r) => r.id !== rowId);
        if (filtered.length) next[messageId] = filtered;
      }

      return next;
    });
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const refetchMessages = useCallback(async () => {
    try {
      const messagesRes = await fetch("/api/chat/messages", {
        cache: "no-store",
      });

      if (!messagesRes.ok) return;

      const json = await messagesRes.json();
      const rows = Array.isArray(json?.messages) ? json.messages : [];

      const normalized: ChatMessageDTO[] = rows.map((r: any) => ({
        id: String(r.id),
        text: String(r.text ?? ""),
        senderId: String(r.sender_id),
        senderName: String(r.sender_name ?? ""),
        createdAt: String(r.created_at),
        editedAt: r.edited_at ? String(r.edited_at) : null,
        deletedAt: r.deleted_at ? String(r.deleted_at) : null,
        fileName: r.file_name ? String(r.file_name) : null,
        filePath: r.file_path ? String(r.file_path) : null,
        fileType: r.file_type ? String(r.file_type) : null,
        fileSize:
          typeof r.file_size === "number"
            ? r.file_size
            : r.file_size
              ? Number(r.file_size)
              : null,
        fileUrl: r.file_url ? String(r.file_url) : null,
      }));

      mergeMessages(normalized);

      const messageIds = collectMessageIds(normalized);

      if (messageIds.length === 0) {
        setReactionsByMessage({});
        return;
      }

      const { data: reactionsData, error: reactionsError } = await supabase
        .from("team_message_reactions")
        .select("id, message_id, user_id, user_name, emoji, created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: true });

      if (!reactionsError) {
        const grouped: Record<string, ReactionRow[]> = {};
        for (const row of reactionsData ?? []) {
          const messageId = String(row.message_id);
          if (!grouped[messageId]) grouped[messageId] = [];
          grouped[messageId].push({
            id: String(row.id),
            message_id: String(row.message_id),
            user_id: String(row.user_id),
            user_name: String(row.user_name ?? ""),
            emoji: String(row.emoji),
            created_at: String(row.created_at),
          });
        }
        setReactionsByMessage(grouped);
      } else {
        console.error("[chat] load reactions failed", reactionsError.message);
      }
    } catch (e) {
      console.error("[chat] refetch failed", e);
    }
  }, [collectMessageIds, mergeMessages, supabase]);

  const loadMentionUsers = useCallback(async () => {
    if (!tenantId) return;

    try {
      const [profilesRes, messagesRes, reactionsRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("user_id, full_name, tenant_id")
          .eq("tenant_id", tenantId),
        fetch("/api/chat/messages", { cache: "no-store" }),
        supabase.from("team_message_reactions").select("user_id, user_name"),
      ]);

      const userMap = new Map<string, MentionUser>();

      upsertMentionUser(userMap, currentUserId, currentUserName || "Du");

      if (!profilesRes.error) {
        for (const row of profilesRes.data ?? []) {
          upsertMentionUser(userMap, row?.user_id, row?.full_name);
        }
      } else {
        console.error(
          "[chat] load mention users from profiles failed",
          profilesRes.error.message,
        );
      }

      if (messagesRes.ok) {
        const json = await messagesRes.json();
        const rows = Array.isArray(json?.messages) ? json.messages : [];

        for (const row of rows) {
          upsertMentionUser(userMap, row?.sender_id, row?.sender_name);
        }
      } else {
        console.error(
          "[chat] load mention users from messages failed",
          messagesRes.status,
        );
      }

      if (!reactionsRes.error) {
        for (const row of reactionsRes.data ?? []) {
          upsertMentionUser(userMap, row?.user_id, row?.user_name);
        }
      } else {
        console.error(
          "[chat] load mention users from reactions failed",
          reactionsRes.error.message,
        );
      }

      const users = Array.from(userMap.values()).sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "de"),
      );

      setMentionUsers(users);
    } catch (e) {
      console.error("[chat] load mention users failed", e);
    }
  }, [supabase, tenantId, currentUserId, currentUserName]);

  const sendTypingEvent = useCallback(
    async (isTyping: boolean) => {
      const channel = typingChannelRef.current;
      if (!channel || !tenantId) return;

      try {
        await channel.send({
          type: "broadcast",
          event: "typing",
          payload: {
            userId: currentUserId,
            userName: currentUserName || "Team",
            isTyping,
            timestamp: Date.now(),
          },
        });
      } catch (e) {
        console.error("[typing] send failed", e);
      }
    },
    [tenantId, currentUserId, currentUserName],
  );

  const markLatestAsRead = useCallback(() => {
    if (!storageKey || messages.length === 0) return;

    const latestId = messages[messages.length - 1]?.id ?? null;
    if (!latestId) return;

    setLastReadMessageId(latestId);

    try {
      localStorage.setItem(storageKey, latestId);
    } catch {}
  }, [messages, storageKey]);

  const findReplySourceMessage = useCallback(
    (parsedReply: ParsedReplyMessage) => {
      const replySender = parsedReply.replySender.trim().toLowerCase();
      const replyPreview = parsedReply.replyPreview.trim();

      if (!replySender || !replyPreview) return null;

      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const msgName =
          msg.senderId === currentUserId
            ? "dir"
            : (msg.senderName || "Team").trim().toLowerCase();

        if (msgName !== replySender) continue;

        const preview = getReplyPreview(msg);
        if (
          preview === replyPreview ||
          preview.startsWith(replyPreview) ||
          replyPreview.startsWith(preview)
        ) {
          return msg;
        }
      }

      return null;
    },
    [messages, currentUserId],
  );

  const jumpToMessage = useCallback((messageId: string) => {
    const node = messageRefs.current[messageId];
    if (!node) return;

    node.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    setHighlightedMessageId(messageId);

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
    }, 1800);
  }, []);

  function insertMention(user: MentionUser) {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    const currentText = text;
    const currentMention = getMentionMatch(
      currentText,
      textarea.selectionStart ?? currentText.length,
    );

    if (!currentMention.active || currentMention.startIndex < 0) return;

    const mention = getMentionInsertValue(user.fullName);
    const before = currentText.slice(0, currentMention.startIndex);
    const after = currentText.slice(currentMention.endIndex);
    const needsSpaceAfter =
      after.startsWith(" ") || after.length === 0 ? "" : " ";
    const nextText = `${before}${mention}${needsSpaceAfter}${after}`;

    setText(nextText);
    setMentionState({
      active: false,
      query: "",
      startIndex: -1,
      endIndex: -1,
    });

    requestAnimationFrame(() => {
      textarea.focus();
      const pos = before.length + mention.length + needsSpaceAfter.length;
      textarea.setSelectionRange(pos, pos);
      autoResizeTextarea(textarea, 160);
    });
  }

  function insertMentionAtCursor(user: MentionUser) {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    const mention = getMentionInsertValue(user.fullName);
    const selectionStart = textarea.selectionStart ?? text.length;
    const selectionEnd = textarea.selectionEnd ?? text.length;

    const before = text.slice(0, selectionStart);
    const after = text.slice(selectionEnd);

    const needsSpaceBefore =
      before.length > 0 && !/\s$/.test(before) ? " " : "";
    const needsSpaceAfter =
      after.length > 0 && !/^[\s,.:;!?]/.test(after) ? " " : " ";

    const nextText = `${before}${needsSpaceBefore}${mention}${needsSpaceAfter}${after}`;

    setText(nextText);
    setMentionState({
      active: false,
      query: "",
      startIndex: -1,
      endIndex: -1,
    });

    requestAnimationFrame(() => {
      textarea.focus();
      const pos =
        before.length +
        needsSpaceBefore.length +
        mention.length +
        needsSpaceAfter.length;

      textarea.setSelectionRange(pos, pos);
      autoResizeTextarea(textarea, 160);
      scrollToBottom("smooth");
    });
  }

  useEffect(() => {
    if (!storageKey) return;

    try {
      const saved = localStorage.getItem(storageKey);
      setLastReadMessageId(saved || null);
    } catch {
      setLastReadMessageId(null);
    }
  }, [storageKey]);

  useEffect(() => {
    scrollToBottom("auto");
  }, [scrollToBottom]);

  useEffect(() => {
    loadMentionUsers();
  }, [loadMentionUsers]);

  useEffect(() => {
    if (!autoScroll) return;
    scrollToBottom(messages.length > 1 ? "smooth" : "auto");
  }, [autoScroll, messages, typingUsers.length, scrollToBottom]);

  useEffect(() => {
    if (autoScroll && document.visibilityState === "visible") {
      markLatestAsRead();
    }
  }, [autoScroll, messages, markLatestAsRead]);

  useEffect(() => {
    autoResizeTextarea(composerTextareaRef.current, 160);
  }, [text]);

  useEffect(() => {
    onRealtimeStatusChange?.(realtimeStatus);
  }, [onRealtimeStatusChange, realtimeStatus]);

  useEffect(() => {
    autoResizeTextarea(editTextareaRef.current, 220);
  }, [editingText, editingMessageId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAutoScroll(dist < 80);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onFocus = () => {
      refetchMessages();
      loadMentionUsers();
      if (autoScroll) {
        markLatestAsRead();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refetchMessages();
        loadMentionUsers();
        if (autoScroll) {
          markLatestAsRead();
        }
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refetchMessages, loadMentionUsers, autoScroll, markLatestAsRead]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => prev.filter((u) => u.expiresAt > now));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mentionState.active) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (mentionDropdownRef.current?.contains(target)) return;
      if (composerTextareaRef.current?.contains(target)) return;

      setMentionState({
        active: false,
        query: "",
        startIndex: -1,
        endIndex: -1,
      });
    };

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [mentionState.active]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const viewport = window.visualViewport;

    const updateInset = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      );
      setKeyboardInset(inset);
    };

    updateInset();
    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);

    return () => {
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
    };
  }, []);

  useEffect(() => {
    if (!previewImage) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewImage(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewImage]);

  useEffect(() => {
    return () => {
      clearReconnectTimeout();
    };
  }, [clearReconnectTimeout]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onMentionUser = (event: Event) => {
      const customEvent = event as CustomEvent<{
        userId: string;
        fullName: string;
      }>;
      const detail = customEvent.detail;

      if (!detail?.userId || !detail?.fullName) return;

      insertMentionAtCursor({
        userId: detail.userId,
        fullName: detail.fullName,
      });
    };

    window.addEventListener(
      "chat:mention-user",
      onMentionUser as EventListener,
    );

    return () => {
      window.removeEventListener(
        "chat:mention-user",
        onMentionUser as EventListener,
      );
    };
  }, [text, scrollToBottom]);

  useEffect(() => {
    if (!tenantId) return;

    let messageChannel: ReturnType<typeof supabase.channel> | null = null;
    let typingChannel: ReturnType<typeof supabase.channel> | null = null;
    let reactionsChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    hasFetchedRealtimeFallbackRef.current = false;
    clearReconnectTimeout();
    setRealtimeStatus("connecting");

    const scheduleReconnectFallback = () => {
      clearReconnectTimeout();

      reconnectTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;

        hasFetchedRealtimeFallbackRef.current = true;
        setRealtimeStatus("reconnecting");
        refetchMessages();
        loadMentionUsers();
      }, 1500);
    };

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          supabase.realtime.setAuth(token);
        }

        if (cancelled) return;

        messageChannel = supabase
          .channel(`team-messages:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "team_messages",
              filter: `tenant_id=eq.${tenantId}`,
            },
            async (payload: any) => {
              const row = (payload.new || payload.old) as any;
              if (!row) return;

              if (
                payload.eventType === "INSERT" ||
                payload.eventType === "UPDATE"
              ) {
                const normalizedRow: ChatMessageDTO = {
                  id: String(row.id ?? ""),
                  text: String(row.text ?? ""),
                  senderId: String(row.sender_id ?? ""),
                  senderName:
                    String(row.sender_name ?? "") ||
                    (String(row.sender_id ?? "") === currentUserId
                      ? currentUserName
                      : "Team"),
                  createdAt: String(row.created_at ?? new Date().toISOString()),
                  editedAt: row.edited_at ? String(row.edited_at) : null,
                  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
                  fileName: row.file_name ? String(row.file_name) : null,
                  filePath: row.file_path ? String(row.file_path) : null,
                  fileType: row.file_type ? String(row.file_type) : null,
                  fileSize:
                    typeof row.file_size === "number"
                      ? row.file_size
                      : row.file_size
                        ? Number(row.file_size)
                        : null,
                  fileUrl:
                    row.file_url && typeof row.file_url === "string"
                      ? row.file_url
                      : null,
                };

                mergeMessages([normalizedRow]);

                const shouldReloadMentionUsers =
                  payload.eventType === "INSERT" &&
                  normalizedRow.senderId &&
                  normalizedRow.senderName;

                if (shouldReloadMentionUsers) {
                  loadMentionUsers();
                }

                const needsRefetchForAttachment =
                  Boolean(row.file_path) &&
                  (!row.file_url || payload.eventType === "INSERT");

                if (needsRefetchForAttachment) {
                  refetchMessages();
                }
              }
            },
          )
          .subscribe((status: string) => {
            console.log("[realtime] messages status:", status);

            if (status === "SUBSCRIBED") {
              clearReconnectTimeout();
              setRealtimeStatus("connected");

              if (hasFetchedRealtimeFallbackRef.current) {
                refetchMessages();
                loadMentionUsers();
              }
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              setRealtimeStatus("offline");
              scheduleReconnectFallback();
            }
          });

        typingChannel = supabase
          .channel(`typing:${tenantId}`, {
            config: {
              broadcast: { self: false },
            },
          })
          .on(
            "broadcast",
            { event: "typing" },
            ({ payload }: { payload: any }) => {
              const userId = String(payload?.userId ?? "");
              const userName = String(payload?.userName ?? "Team");
              const isTyping = Boolean(payload?.isTyping);

              if (!userId || userId === currentUserId) return;

              if (isTyping) {
                setTypingUsers((prev) => {
                  const next = prev.filter((u) => u.userId !== userId);
                  next.push({
                    userId,
                    userName,
                    expiresAt: Date.now() + 3000,
                  });
                  return next;
                });
              } else {
                setTypingUsers((prev) =>
                  prev.filter((u) => u.userId !== userId),
                );
              }
            },
          )
          .subscribe((status: string) => {
            console.log("[realtime] typing status:", status);
          });

        reactionsChannel = supabase
          .channel(`team-message-reactions:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "team_message_reactions",
            },
            (payload: any) => {
              const row = payload.new as any;
              const messageId = String(row.message_id ?? "");

              if (!messageId) return;
              if (
                !messageRefs.current[messageId] &&
                !messages.some((m) => m.id === messageId)
              ) {
                return;
              }

              setReactionRow({
                id: String(row.id),
                message_id: messageId,
                user_id: String(row.user_id),
                user_name: String(row.user_name ?? ""),
                emoji: String(row.emoji),
                created_at: String(row.created_at),
              });
            },
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "team_message_reactions",
            },
            (payload: any) => {
              const row = payload.old as any;
              removeReactionRow(String(row.id));
            },
          )
          .subscribe((status: string) => {
            console.log("[realtime] reactions status:", status);
          });

        typingChannelRef.current = typingChannel;
      } catch (e) {
        console.error("[realtime] setup error", e);
        setRealtimeStatus("offline");
        scheduleReconnectFallback();
      }
    })();

    return () => {
      cancelled = true;
      clearReconnectTimeout();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      sendTypingEvent(false);

      if (messageChannel) supabase.removeChannel(messageChannel);
      if (typingChannel) supabase.removeChannel(typingChannel);
      if (reactionsChannel) supabase.removeChannel(reactionsChannel);
      typingChannelRef.current = null;
    };
  }, [
    supabase,
    tenantId,
    currentUserId,
    currentUserName,
    mergeMessages,
    sendTypingEvent,
    setReactionRow,
    removeReactionRow,
    refetchMessages,
    loadMentionUsers,
    messages,
    clearReconnectTimeout,
  ]);

  async function send() {
    setMobileComposerMenuOpen(false);
    const value = text.trim();
    const file = selectedFile;

    if ((!value && !file && !replyTarget) || sending) return;

    const finalText = buildReplyMessage(replyTarget, value);

    setSending(true);
    try {
      setText("");
      setSelectedFile(null);
      setReplyTarget(null);
      setMentionState({
        active: false,
        query: "",
        startIndex: -1,
        endIndex: -1,
      });

      if (fileInputRef.current) fileInputRef.current.value = "";
      await sendTypingEvent(false);

      let res: Response;

      if (file) {
        const formData = new FormData();
        formData.append("text", finalText);
        formData.append("file", file);

        res = await fetch("/api/chat/messages", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: finalText }),
        });
      }

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Senden fehlgeschlagen");
      }

      setAutoScroll(true);
      requestAnimationFrame(() => {
        scrollToBottom("smooth");
        markLatestAsRead();
      });
    } catch (e) {
      setText(value);
      setSelectedFile(file);
      console.error(e);
      alert("Nachricht/Datei konnte nicht gesendet werden.");
    } finally {
      setSending(false);
    }
  }

  function insertEmojiIntoComposer(emoji: string) {
    const textarea = composerTextareaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    const nextCaret = start + emoji.length;

    setText(nextText);
    setMentionState({ active: false, query: "", startIndex: -1, endIndex: -1 });

    requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      composerTextareaRef.current?.setSelectionRange(nextCaret, nextCaret);
      autoResizeTextarea(composerTextareaRef.current);
    });
  }

  async function toggleReaction(messageId: string, emoji: string) {
    try {
      const res = await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Reaktion fehlgeschlagen");
      }
    } catch (e) {
      console.error(e);
      alert("Reaktion konnte nicht gespeichert werden.");
    }
  }

  async function saveEdit(messageId: string) {
    const value = editingText.trim();
    if (!value) return;

    try {
      const res = await fetch(`/api/chat/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Bearbeiten fehlgeschlagen");
      }

      setEditingMessageId(null);
      setEditingText("");
    } catch (e) {
      console.error(e);
      alert("Nachricht konnte nicht bearbeitet werden.");
    }
  }

  async function deleteMessage(messageId: string) {
    const ok = window.confirm("Willst du diese Nachricht wirklich löschen?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/chat/messages/${messageId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Löschen fehlgeschlagen");
      }
    } catch (e) {
      console.error(e);
      alert("Nachricht konnte nicht gelöscht werden.");
    }
  }

  function handleTyping(value: string) {
    setText(value);
    setComposerEmojiPickerOpen(false);

    const caret = composerTextareaRef.current?.selectionStart ?? value.length;
    const mention = getMentionMatch(value, caret);
    setMentionState(mention);

    if (!value.trim()) {
      sendTypingEvent(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      return;
    }

    sendTypingEvent(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingEvent(false);
    }, 2500);
  }

  const handleStartEdit = useCallback(
    (message: ChatMessageDTO) => {
      setEditingMessageId(message.id);
      setEditingText(message.text);
      setTimeout(() => scrollToBottom("smooth"), 100);
    },
    [scrollToBottom],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingText("");
  }, []);

  const handleSwipeReply = useCallback(
    (message: ChatMessageDTO) => {
      setReplyTarget({
        id: message.id,
        senderName:
          message.senderId === currentUserId
            ? "dir"
            : message.senderName || "Team",
        text: getReplyPreview(message),
        fileName: message.fileName ?? null,
      });

      setTimeout(() => {
        composerTextareaRef.current?.focus();
        scrollToBottom("smooth");
      }, 50);
    },
    [currentUserId, scrollToBottom],
  );

  const handleJumpToReplySource = useCallback(
    (parsedReply: ParsedReplyMessage) => {
      const sourceMessage = findReplySourceMessage(parsedReply);

      if (!sourceMessage) {
        alert("Originalnachricht konnte nicht gefunden werden.");
        return;
      }

      jumpToMessage(sourceMessage.id);
    },
    [findReplySourceMessage, jumpToMessage],
  );

  const unreadDividerIndex = useMemo(() => {
    if (!lastReadMessageId || messages.length === 0) return -1;

    const lastReadIndex = messages.findIndex((m) => m.id === lastReadMessageId);
    if (lastReadIndex < 0) return -1;

    for (let i = lastReadIndex + 1; i < messages.length; i++) {
      if (messages[i].senderId !== currentUserId) {
        return i;
      }
    }

    return -1;
  }, [lastReadMessageId, messages, currentUserId]);

  const typingText =
    typingUsers.length === 0
      ? ""
      : typingUsers.length === 1
        ? `${typingUsers[0].userName} schreibt...`
        : `${typingUsers.map((u) => u.userName).join(", ")} schreiben...`;

  const showMentionDropdown =
    mentionState.active &&
    filteredMentionUsers.length > 0 &&
    editingMessageId === null;

  return (
    <>
      <div
        className={
          "flex min-h-0 flex-col " +
          (embedded ? "h-full" : "h-[calc(100dvh-220px)]")
        }
      >
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-4 sm:py-4 [scrollbar-color:rgba(216,193,160,0.34)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-corner]:bg-transparent [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[#d8c1a0]/32 [&::-webkit-scrollbar-thumb]:bg-clip-content hover:[&::-webkit-scrollbar-thumb]:bg-[#d8c1a0]/52"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: "7rem",
            contain: "layout paint size",
          }}
        >
          <div className="flex flex-col gap-1">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] p-6 text-center text-sm text-white/60">
                Noch keine Nachrichten. Schreib die erste Nachricht an dein Team
                👋
              </div>
            ) : null}

            {messages.map((m, index) => (
              <React.Fragment key={m.id}>
                {index === unreadDividerIndex ? (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-indigo-400/30" />
                    <div className="shrink-0 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-200">
                      Neue Nachrichten
                    </div>
                    <div className="h-px flex-1 bg-indigo-400/30" />
                  </div>
                ) : null}

                <ChatMessageItem
                  message={m}
                  prevMessage={messages[index - 1]}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  reactions={reactionsByMessage[m.id] ?? []}
                  editingMessageId={editingMessageId}
                  editingText={editingText}
                  onEditingTextChange={setEditingText}
                  onSaveEdit={saveEdit}
                  onCancelEdit={handleCancelEdit}
                  onStartEdit={handleStartEdit}
                  onDelete={deleteMessage}
                  onToggleReaction={toggleReaction}
                  openReactionPickerMessageId={openReactionPickerMessageId}
                  onOpenReactionPicker={(messageId) => {
                    setComposerEmojiPickerOpen(false);
                    setOpenReactionPickerMessageId((current) =>
                      current === messageId ? null : messageId,
                    );
                  }}
                  onCloseEmojiPicker={() =>
                    setOpenReactionPickerMessageId(null)
                  }
                  onOpenPreviewImage={setPreviewImage}
                  onSwipeReply={handleSwipeReply}
                  onJumpToReplySource={handleJumpToReplySource}
                  editTextareaRef={editTextareaRef}
                  messageRef={(node) => {
                    messageRefs.current[m.id] = node;
                  }}
                  isHighlighted={highlightedMessageId === m.id}
                />
              </React.Fragment>
            ))}

            {typingText ? (
              <div className="flex gap-3 py-2">
                <div className="w-9 shrink-0" />
                <div className="text-xs italic text-white/50">{typingText}</div>
              </div>
            ) : null}

            <div ref={endRef} />
          </div>
        </div>

        <div
          className="bg-transparent px-2 pb-2 pt-1 sm:px-4 sm:pb-4 sm:pt-2"
          style={{
            paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px + 6px)`,
          }}
        >
          <div className="w-full bg-transparent p-0">
            <div className="relative w-full">
              {replyTarget ? (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-[16px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                      Antwort
                    </div>
                    <div className="mt-1 text-sm font-medium text-white">
                      {replyTarget.senderName}
                    </div>
                    <div className="truncate text-xs text-white/60">
                      {replyTarget.text}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white hover:bg-white/[0.08]"
                  >
                    Entfernen
                  </button>
                </div>
              ) : null}

              {selectedFile ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-[16px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">
                      📎 {selectedFile.name}
                    </div>
                    <div className="text-xs text-white/50">
                      {selectedFile.type || "Datei"} •{" "}
                      {formatFileSize(selectedFile.size)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white hover:bg-white/[0.08]"
                  >
                    Entfernen
                  </button>
                </div>
              ) : null}

              {showMentionDropdown ? (
                <div
                  ref={mentionDropdownRef}
                  className="mb-3 overflow-hidden rounded-[16px] border border-[#d8c1a0]/14 bg-[#1b1511]/95 shadow-2xl"
                >
                  <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/40">
                    Person erwähnen
                  </div>

                  <div className="max-h-64 overflow-y-auto [scrollbar-color:rgba(216,193,160,0.34)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d8c1a0]/32">
                    {filteredMentionUsers.map((user, index) => {
                      const active = index === selectedMentionIndex;
                      const mentionValue = getMentionInsertValue(user.fullName);

                      return (
                        <button
                          key={user.userId}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(user);
                          }}
                          className={
                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition " +
                            (active
                              ? "border border-[#d8c1a0]/24 bg-[#d8c1a0]/[0.16] text-[#f6f0e8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                              : "text-white hover:bg-white/5")
                          }
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {user.fullName}
                            </div>
                            <div
                              className={
                                "truncate text-xs " +
                                (active ? "text-white/62" : "text-white/40")
                              }
                            >
                              {mentionValue}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {composerEmojiPickerOpen ? (
                <EmojiMiniSlideover
                  title="Emoji einfügen"
                  onClose={() => setComposerEmojiPickerOpen(false)}
                  onSelect={(emoji) => {
                    insertEmojiIntoComposer(emoji);
                  }}
                />
              ) : null}

              {mobileComposerMenuOpen ? (
                <div className="mb-2 flex gap-2 rounded-[18px] border border-[#d8c1a0]/16 bg-[#211813]/96 p-2 shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileComposerMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.06] px-3 py-2 text-sm font-semibold text-[#f6f0e8] active:scale-[0.98]"
                  >
                    <span aria-hidden="true">📎</span>
                    Datei
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileComposerMenuOpen(false);
                      setOpenReactionPickerMessageId(null);
                      setComposerEmojiPickerOpen(true);
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.06] px-3 py-2 text-sm font-semibold text-[#f6f0e8] active:scale-[0.98]"
                  >
                    <span aria-hidden="true">☺️</span>
                    Emoji
                  </button>
                </div>
              ) : null}

              <div className="relative flex w-full items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    setTimeout(() => scrollToBottom("smooth"), 100);
                  }}
                />

                <button
                  type="button"
                  onClick={() => setMobileComposerMenuOpen((open) => !open)}
                  className={
                    "absolute bottom-1.5 left-1.5 z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d8c1a0]/14 text-lg font-semibold text-white transition active:scale-[0.98] " +
                    (mobileComposerMenuOpen || composerEmojiPickerOpen
                      ? "bg-[#d8c1a0]/16"
                      : "bg-[#d8c1a0]/[0.045]")
                  }
                  title="Aktion hinzufügen"
                  aria-label="Aktion hinzufügen"
                >
                  +
                </button>

                <textarea
                  ref={composerTextareaRef}
                  value={text}
                  onFocus={() => {
                    setTimeout(() => scrollToBottom("smooth"), 120);
                  }}
                  onChange={(e) => handleTyping(e.target.value)}
                  onSelect={(e) => {
                    const target = e.currentTarget;
                    const mention = getMentionMatch(
                      target.value,
                      target.selectionStart ?? target.value.length,
                    );
                    setMentionState(mention);
                  }}
                  onKeyDown={(e) => {
                    if (showMentionDropdown) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSelectedMentionIndex((prev) =>
                          prev >= filteredMentionUsers.length - 1
                            ? 0
                            : prev + 1,
                        );
                        return;
                      }

                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSelectedMentionIndex((prev) =>
                          prev <= 0
                            ? filteredMentionUsers.length - 1
                            : prev - 1,
                        );
                        return;
                      }

                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        const selectedUser =
                          filteredMentionUsers[selectedMentionIndex];
                        if (selectedUser) {
                          insertMention(selectedUser);
                        }
                        return;
                      }

                      if (e.key === "Escape") {
                        e.preventDefault();
                        setMentionState({
                          active: false,
                          query: "",
                          startIndex: -1,
                          endIndex: -1,
                        });
                        return;
                      }
                    }

                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={
                    replyTarget
                      ? `Antwort an ${replyTarget.senderName}...`
                      : "Gib eine Nachricht ein."
                  }
                  rows={1}
                  className="h-11 min-h-[44px] max-h-36 w-full resize-none overflow-y-auto rounded-[22px] border border-[#d8c1a0]/16 bg-black/25 py-[12px] pl-12 pr-12 text-sm leading-[20px] text-white outline-none placeholder:text-white/38 transition focus:border-[#d8c1a0]/45 focus:bg-black/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                />

                <button
                  type="button"
                  onClick={send}
                  disabled={
                    sending || (!text.trim() && !selectedFile && !replyTarget)
                  }
                  className={
                    "absolute bottom-1.5 right-1.5 z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.045] text-white transition-colors active:scale-[0.98] " +
                    (sending || (!text.trim() && !selectedFile && !replyTarget)
                      ? "cursor-not-allowed opacity-45 pointer-events-none"
                      : "hover:bg-[#d8c1a0]/[0.10]")
                  }
                  aria-label="Nachricht senden"
                  title="Senden"
                >
                  {sending ? (
                    <span className="text-sm font-bold">…</span>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-[16px] w-[16px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 19V5" />
                      <path d="M5 12l7-7 7 7" />
                    </svg>
                  )}
                </button>
              </div>


            </div>
          </div>
        </div>
      </div>

      {previewImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur"
          >
            Schließen
          </button>

          <div
            className="flex max-h-full w-full max-w-6xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-h-[80dvh] w-auto max-w-full rounded-xl object-contain"
            />
            <div className="mt-3 text-center text-sm text-white/80">
              {previewImage.name}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
