type VoiceProfile = {
  lang: string
  pitch: number
  rate: number
  volume: number
  preferredVoiceKeywords: string[]
}

const VOICE_PROFILES: Record<string, VoiceProfile> = {
  'te-IN-female-warm': {
    lang: 'te-IN',
    pitch: 1.0,
    rate: 0.95,
    volume: 1.0,
    preferredVoiceKeywords: ['telugu', 'te-IN', 'te_IN', 'తెలుగు', 'shruti', 'neural', 'enhanced'],
  },
  'te-IN-male-clear': {
    lang: 'te-IN',
    pitch: 0.9,
    rate: 0.97,
    volume: 1.0,
    preferredVoiceKeywords: ['telugu', 'te-IN', 'te_IN', 'తెలుగు', 'neural', 'enhanced'],
  },
  'te-IN-female-calm': {
    lang: 'te-IN',
    pitch: 0.95,
    rate: 0.93,
    volume: 1.0,
    preferredVoiceKeywords: ['telugu', 'te-IN', 'te_IN', 'తెలుగు', 'neural', 'enhanced'],
  },
  'en-IN-female-warm': {
    lang: 'en-IN',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    preferredVoiceKeywords: ['indian', 'en-IN', 'en_IN', 'rishi', 'neerja', 'neural', 'enhanced'],
  },
  'en-IN-male-clear': {
    lang: 'en-IN',
    pitch: 0.95,
    rate: 1.0,
    volume: 1.0,
    preferredVoiceKeywords: ['indian', 'en-IN', 'en_IN', 'rishi', 'neural', 'enhanced'],
  },
  'en-IN-male-calm': {
    lang: 'en-IN',
    pitch: 0.9,
    rate: 0.97,
    volume: 1.0,
    preferredVoiceKeywords: ['indian', 'en-IN', 'en_IN', 'rishi', 'neural', 'enhanced'],
  },
  'en-IN-female-calm': {
    lang: 'en-IN',
    pitch: 0.95,
    rate: 0.98,
    volume: 1.0,
    preferredVoiceKeywords: ['indian', 'en-IN', 'en_IN', 'neerja', 'neural', 'enhanced'],
  },
  'hi-IN-female-warm': {
    lang: 'hi-IN',
    pitch: 1.0,
    rate: 0.97,
    volume: 1.0,
    preferredVoiceKeywords: ['hindi', 'hi-IN', 'hi_IN', 'swara', 'neural', 'enhanced'],
  },
  'hi-IN-male-clear': {
    lang: 'hi-IN',
    pitch: 0.92,
    rate: 0.98,
    volume: 1.0,
    preferredVoiceKeywords: ['hindi', 'hi-IN', 'hi_IN', 'madhur', 'neural', 'enhanced'],
  },
}

let cachedVoices: SpeechSynthesisVoice[] = []

function loadVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return []
  const voices = window.speechSynthesis.getVoices()
  if (voices.length > 0) cachedVoices = voices
  return cachedVoices
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => { cachedVoices = window.speechSynthesis.getVoices() }
  loadVoices()
}

function scoreVoice(voice: SpeechSynthesisVoice, profile: VoiceProfile): number {
  let score = 0
  const nameLower = voice.name.toLowerCase()
  const langLower = voice.lang.toLowerCase()
  const profileLangLower = profile.lang.toLowerCase()

  if (langLower === profileLangLower || langLower === profileLangLower.replace('-', '_')) {
    score += 100
  } else if (langLower.startsWith(profileLangLower.split('-')[0])) {
    score += 40
  } else {
    return 0
  }

  if (nameLower.includes('neural')) score += 50
  if (nameLower.includes('enhanced')) score += 40
  if (nameLower.includes('premium')) score += 35
  if (nameLower.includes('natural')) score += 30
  if (nameLower.includes('wavenet')) score += 25
  if (voice.localService) score += 5

  for (const kw of profile.preferredVoiceKeywords) {
    if (nameLower.includes(kw.toLowerCase())) score += 15
  }

  return score
}

function findBestVoice(profile: VoiceProfile): SpeechSynthesisVoice | null {
  const voices = loadVoices()
  if (voices.length === 0) return null

  let best: SpeechSynthesisVoice | null = null
  let bestScore = 0

  for (const voice of voices) {
    const s = scoreVoice(voice, profile)
    if (s > bestScore) {
      bestScore = s
      best = voice
    }
  }

  return best
}

export function getProfileKey(language: string, voice: string): string {
  const lang = language.toLowerCase().replace('_', '-')
  const v = voice.toLowerCase()

  let gender = 'female'
  if (v.includes('male') && !v.includes('female')) gender = 'male'

  let style = 'warm'
  if (v.includes('clear')) style = 'clear'
  else if (v.includes('calm')) style = 'calm'

  const langPrefix = lang.startsWith('te') ? 'te-IN'
    : lang.startsWith('hi') ? 'hi-IN'
    : 'en-IN'

  const key = `${langPrefix}-${gender}-${style}`
  return key in VOICE_PROFILES ? key : `${langPrefix}-female-warm`
}

function cleanTextForSpeech(text: string): string {
  let cleaned = text
    .replace(/[​-‍﻿­]/g, '')
    .replace(/\{name\}/gi, '')
    .replace(/[*_~`#>|]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[+]\d[\d\s-]{8,}/g, '')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned
}

function splitByScript(text: string): Array<{ text: string; isIndic: boolean }> {
  const segments: Array<{ text: string; isIndic: boolean }> = []
  const indicRange = /[ఀ-౿ऀ-ॿঀ-৿਀-੿઀-૿଀-୿஀-௿ಀ-೿ഀ-ൿ]/
  let current = ''
  let currentIsIndic = false

  for (const char of text) {
    const charIsIndic = indicRange.test(char)
    const isSpace = /\s/.test(char)

    if (isSpace) {
      current += char
      continue
    }

    if (current.trim() && charIsIndic !== currentIsIndic) {
      segments.push({ text: current.trim(), isIndic: currentIsIndic })
      current = ''
    }
    currentIsIndic = charIsIndic
    current += char
  }

  if (current.trim()) {
    segments.push({ text: current.trim(), isIndic: currentIsIndic })
  }

  return segments
}

export function speak(
  text: string,
  language: string,
  voice: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: () => void
): SpeechSynthesisUtterance | null {
  if (!('speechSynthesis' in window)) return null

  try {
    window.speechSynthesis.cancel()

    const cleaned = cleanTextForSpeech(text)
    if (!cleaned) { onEnd?.(); return null }

    const profileKey = getProfileKey(language, voice)
    const profile = VOICE_PROFILES[profileKey] ?? VOICE_PROFILES['en-IN-female-warm']
    const isIndicLang = language.startsWith('te') || language.startsWith('hi')

    const segments = isIndicLang ? splitByScript(cleaned) : [{ text: cleaned, isIndic: false }]
    const mergedSegments: Array<{ text: string; lang: string }> = []

    for (const seg of segments) {
      const segLang = seg.isIndic ? profile.lang : (isIndicLang ? 'en-IN' : profile.lang)
      const prev = mergedSegments[mergedSegments.length - 1]
      if (prev && prev.lang === segLang) {
        prev.text += ' ' + seg.text
      } else {
        mergedSegments.push({ text: seg.text, lang: segLang })
      }
    }

    const shortEnglishInIndic = isIndicLang && mergedSegments.length > 2
    if (shortEnglishInIndic) {
      const consolidated: Array<{ text: string; lang: string }> = []
      for (const seg of mergedSegments) {
        const isShortEnglish = seg.lang === 'en-IN' && seg.text.split(/\s+/).length <= 3
        const prev = consolidated[consolidated.length - 1]
        if (isShortEnglish && prev && prev.lang === profile.lang) {
          prev.text += ' ' + seg.text
        } else {
          consolidated.push({ ...seg })
        }
      }
      mergedSegments.length = 0
      mergedSegments.push(...consolidated)
    }

    let started = false
    const total = mergedSegments.length
    let completed = 0

    const resumeTimer = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) return
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    }, 5000)

    const done = () => { clearInterval(resumeTimer) }

    for (let i = 0; i < total; i++) {
      const seg = mergedSegments[i]
      const segProfile = seg.lang === profile.lang ? profile : (VOICE_PROFILES[getProfileKey(seg.lang, voice)] ?? profile)

      const utterance = new SpeechSynthesisUtterance(seg.text)
      utterance.lang = seg.lang
      utterance.pitch = segProfile.pitch
      utterance.rate = segProfile.rate
      utterance.volume = segProfile.volume

      const bestVoice = findBestVoice(segProfile)
      if (bestVoice) utterance.voice = bestVoice

      utterance.onstart = () => { if (!started) { started = true; onStart?.() } }
      utterance.onend = () => { completed++; if (completed >= total) { done(); onEnd?.() } }
      utterance.onerror = () => { completed++; if (completed >= total) { done(); onError?.() } }

      window.speechSynthesis.speak(utterance)
    }

    return null
  } catch {
    onError?.()
    return null
  }
}

export function previewVoice(language: string, voice: string): void {
  const profileKey = getProfileKey(language, voice)
  const isTeluguProfile = profileKey.startsWith('te-IN')
  const isHindiProfile = profileKey.startsWith('hi-IN')

  const previewText = isTeluguProfile
    ? 'నమస్కారం! వాణి వాయిస్ ఏఐ ప్లాట్‌ఫారమ్ నుండి మాట్లాడుతున్నాను. మీకు ఏదైనా సహాయం చేయగలనా?'
    : isHindiProfile
    ? 'नमस्ते! मैं वाणी वॉइस एआई प्लेटफॉर्म से बात कर रही हूँ। क्या मैं आपकी कोई मदद कर सकती हूँ?'
    : 'Hello! This is Vaani Voice AI platform. We help businesses engage customers through intelligent voice automation.'

  speak(previewText, language, voice)
}

export function getAvailableVoices(): Array<{ name: string; lang: string; isNeural: boolean }> {
  const voices = loadVoices()
  return voices
    .filter(v => {
      const l = v.lang.toLowerCase()
      return l.startsWith('en') || l.startsWith('te') || l.startsWith('hi')
    })
    .map(v => ({
      name: v.name,
      lang: v.lang,
      isNeural: /neural|enhanced|premium|natural|wavenet/i.test(v.name),
    }))
    .sort((a, b) => {
      if (a.isNeural !== b.isNeural) return a.isNeural ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export const VOICE_OPTIONS = [
  { value: 'Warm female', label: 'Warm Female' },
  { value: 'Clear male', label: 'Clear Male' },
  { value: 'Calm female', label: 'Calm Female' },
  { value: 'Calm male', label: 'Calm Male' },
]

export const LANGUAGE_OPTIONS = [
  { value: 'te-IN', label: 'తెలుగు (Telugu)' },
  { value: 'en-IN', label: 'English (Indian)' },
  { value: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { value: 'en-US', label: 'English (Global)' },
]
