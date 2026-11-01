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
    pitch: 1.05,
    rate: 0.88,
    volume: 1.0,
    preferredVoiceKeywords: ['telugu', 'te-IN', 'te_IN', 'తెలుగు', 'shruti', 'neural', 'enhanced'],
  },
  'te-IN-male-clear': {
    lang: 'te-IN',
    pitch: 0.85,
    rate: 0.90,
    volume: 1.0,
    preferredVoiceKeywords: ['telugu', 'te-IN', 'te_IN', 'తెలుగు', 'neural', 'enhanced'],
  },
  'te-IN-female-calm': {
    lang: 'te-IN',
    pitch: 0.95,
    rate: 0.85,
    volume: 0.95,
    preferredVoiceKeywords: ['telugu', 'te-IN', 'te_IN', 'తెలుగు', 'neural', 'enhanced'],
  },
  'en-IN-female-warm': {
    lang: 'en-IN',
    pitch: 1.05,
    rate: 0.95,
    volume: 1.0,
    preferredVoiceKeywords: ['indian', 'en-IN', 'en_IN', 'rishi', 'neerja', 'neural', 'enhanced'],
  },
  'en-IN-male-clear': {
    lang: 'en-IN',
    pitch: 0.90,
    rate: 0.97,
    volume: 1.0,
    preferredVoiceKeywords: ['indian', 'en-IN', 'en_IN', 'rishi', 'neural', 'enhanced'],
  },
  'en-IN-male-calm': {
    lang: 'en-IN',
    pitch: 0.85,
    rate: 0.92,
    volume: 0.95,
    preferredVoiceKeywords: ['indian', 'en-IN', 'en_IN', 'rishi', 'neural', 'enhanced'],
  },
  'en-IN-female-calm': {
    lang: 'en-IN',
    pitch: 0.95,
    rate: 0.93,
    volume: 0.95,
    preferredVoiceKeywords: ['indian', 'en-IN', 'en_IN', 'neerja', 'neural', 'enhanced'],
  },
  'hi-IN-female-warm': {
    lang: 'hi-IN',
    pitch: 1.05,
    rate: 0.90,
    volume: 1.0,
    preferredVoiceKeywords: ['hindi', 'hi-IN', 'hi_IN', 'swara', 'neural', 'enhanced'],
  },
  'hi-IN-male-clear': {
    lang: 'hi-IN',
    pitch: 0.88,
    rate: 0.92,
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

    const profileKey = getProfileKey(language, voice)
    const profile = VOICE_PROFILES[profileKey] ?? VOICE_PROFILES['en-IN-female-warm']

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = profile.lang
    utterance.pitch = profile.pitch
    utterance.rate = profile.rate
    utterance.volume = profile.volume

    const bestVoice = findBestVoice(profile)
    if (bestVoice) utterance.voice = bestVoice

    utterance.onstart = () => onStart?.()
    utterance.onend = () => onEnd?.()
    utterance.onerror = () => onError?.()

    window.speechSynthesis.speak(utterance)
    return utterance
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
