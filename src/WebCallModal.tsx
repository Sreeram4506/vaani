import { useEffect, useRef, useState } from 'react'
import {
  Microphone, MicrophoneSlash, SpeakerHigh, SpeakerSlash,
  PhoneDisconnect, PaperPlaneRight, Sparkle,
  CheckCircle, ArrowCounterClockwise, X, CaretDown
} from '@phosphor-icons/react'

type Agent = {
  id: string
  name: string
  language: string
  voice: string
  firstMessage: string
  prompt: string
  maxDuration: number
}

type Message = {
  id: string
  role: 'assistant' | 'user'
  text: string
  time: string
}

type Props = {
  close: () => void
  notify: (msg: string) => void
  onCallSaved?: () => void
  initialAgentId?: string
}

const fallbackAgents: Agent[] = [
  {
    id: 'a-aditi',
    name: 'Aditi',
    language: 'en-IN',
    voice: 'Warm female',
    maxDuration: 300,
    firstMessage: 'Hi! This is Aditi from ARTH Marketing Media. We help businesses uncover bottlenecks in their customer acquisition funnel and scale with Meta and Google Ads. Are you looking to generate more qualified leads or scale your ad spend this quarter?',
    prompt: 'Senior Growth Strategist at ARTH Marketing Media'
  },
  {
    id: 'a-kabir',
    name: 'Kabir',
    language: 'en-IN',
    voice: 'Clear male',
    maxDuration: 300,
    firstMessage: 'Hey! Kabir here from ARTH. We produce high-converting short-form videos, reels, and product ad creatives—like our work with Fit Secrets. How is your brand currently approaching video content on Instagram?',
    prompt: 'Creative & Video Producer at ARTH Marketing Media'
  },
  {
    id: 'a-dev',
    name: 'Dev',
    language: 'en-IN',
    voice: 'Calm male',
    maxDuration: 300,
    firstMessage: 'Hello! Dev from ARTH Technology. We design and build ultra-fast business websites, e-commerce stores, and custom WhatsApp integrations for companies like Samadhai Technologies, Quantumrise Infra, and Acuity Tax. Is your team looking to upgrade your web presence?',
    prompt: 'Technology & Web Solutions Lead at ARTH'
  },
  {
    id: 'a-priya',
    name: 'Priya',
    language: 'te-IN',
    voice: 'Warm female',
    maxDuration: 300,
    firstMessage: 'నమస్కారం! నేను ARTH Marketing Media నుండి ప్రియ మాట్లాడుతున్నాను. మీ వ్యాపారానికి ఆన్‌లైన్ సోషల్ మీడియా మరియు ఆఫ్‌లైన్ ప్రమోషన్స్ ద్వారా ఎక్కువ మంది కస్టమర్లను మరియు సేల్స్‌ను తీసుకురావడంలో మేము సహాయం చేస్తాము. మీతో మాట్లాడవచ్చా?',
    prompt: 'Local & Regional Outreach Specialist at ARTH'
  },
  {
    id: 'a-rhea',
    name: 'Rhea',
    language: 'en-IN',
    voice: 'Calm female',
    maxDuration: 300,
    firstMessage: 'Hi! Rhea from ARTH Marketing Media. We offer complimentary marketing audits for qualified brands to pinpoint where growth is leaking across your ads, content, and website. Would you like to review your current growth bottlenecks?',
    prompt: 'Inbound Growth & Marketing Audit Specialist at ARTH'
  }
]

export function WebCallModal({ close, notify, onCallSaved, initialAgentId }: Props) {
  const [agents, setAgents] = useState<Agent[]>(fallbackAgents)
  const [activeAgentId, setActiveAgentId] = useState<string>(initialAgentId || 'a-aditi')
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const [callState, setCallState] = useState<'connecting' | 'active' | 'ended'>('connecting')
  const [duration, setDuration] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speakerEnabled, setSpeakerEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(true)
  const [interimText, setInterimText] = useState('')
  const [outcome, setOutcome] = useState('in_progress')
  const [isThinking, setIsThinking] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | undefined>(undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Load agents from backend
  useEffect(() => {
    fetch('/api/agents')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then((data: { agents: Agent[] }) => {
        if (data.agents && data.agents.length > 0) {
          setAgents(data.agents)
          if (!initialAgentId) {
            setActiveAgentId(data.agents[0].id)
          }
        }
      })
      .catch(() => undefined)
  }, [initialAgentId])

  const activeAgent = agents.find(a => a.id === activeAgentId) ?? agents[0] ?? fallbackAgents[0]

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const nowTime = () => {
    const d = new Date()
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  // Voice speech synthesis
  const speakText = (text: string) => {
    if (!speakerEnabled || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = activeAgent.language === 'te-IN' ? 'te-IN' : 'en-IN'
      utterance.rate = activeAgent.language === 'te-IN' ? 0.95 : 1.0
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      synthRef.current = utterance
      window.speechSynthesis.speak(utterance)
    } catch {
      setIsSpeaking(false)
    }
  }

  // Connect to the active agent
  const startSessionWithAgent = (agent: Agent) => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setCallState('connecting')
    setDuration(0)
    setMessages([])
    setOutcome('in_progress')
    setIsSpeaking(false)

    window.setTimeout(() => {
      setCallState('active')
      const firstGreeting = agent.firstMessage.replace('{name}', 'there')
      const initMsg: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: firstGreeting,
        time: nowTime()
      }
      setMessages([initMsg])
      speakText(firstGreeting)
    }, 900)
  }

  // Initial connect
  useEffect(() => {
    const timer = window.setTimeout(() => {
      startSessionWithAgent(activeAgent)
    }, 400)

    return () => {
      window.clearTimeout(timer)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [activeAgentId])

  // Call duration counter
  useEffect(() => {
    if (callState === 'active') {
      timerRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [callState])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, interimText, isThinking])

  // Speech Recognition setup (Web Speech API)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = activeAgent.language === 'te-IN' ? 'te-IN' : 'en-IN'

      recognition.onstart = () => setIsListening(true)
      recognition.onend = () => {
        setIsListening(false)
        if (callState === 'active' && micEnabled) {
          try { recognition.start() } catch { /* ignore */ }
        }
      }
      recognition.onerror = () => setIsListening(false)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript
          } else {
            interim += event.results[i][0].transcript
          }
        }
        if (interim) setInterimText(interim)
        if (final.trim()) {
          setInterimText('')
          void handleUserSend(final.trim())
        }
      }

      recognitionRef.current = recognition
      if (callState === 'active' && micEnabled) {
        try { recognition.start() } catch { /* ignore */ }
      }
    } catch {
      // Speech recognition not permitted or supported
    }

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch { /* ignore */ }
      }
    }
  }, [callState, micEnabled, activeAgent.language])

  const toggleMic = () => {
    if (micEnabled) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch { /* ignore */ }
      }
      setMicEnabled(false)
      notify('Microphone muted.')
    } else {
      setMicEnabled(true)
      if (recognitionRef.current) {
        try { recognitionRef.current.start() } catch { /* ignore */ }
      }
      notify('Microphone unmuted.')
    }
  }

  const toggleSpeaker = () => {
    if (speakerEnabled) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      setIsSpeaking(false)
      setSpeakerEnabled(false)
      notify('Speaker muted.')
    } else {
      setSpeakerEnabled(true)
      notify('Speaker unmuted.')
    }
  }

  const handleUserSend = async (text: string) => {
    const clean = text.trim()
    if (!clean || callState !== 'active') return

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: clean,
      time: nowTime()
    }

    const updated = [...messages, userMsg]
    setMessages(updated)
    setInputText('')
    setInterimText('')
    setIsThinking(true)

    try {
      const response = await fetch('/api/web-call/reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, text: m.text })),
          userName: 'Prospective Client',
          agentId: activeAgent.id
        })
      })

      const data = await response.json() as { reply: string; outcome?: string }
      setIsThinking(false)

      const assistantMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: data.reply,
        time: nowTime()
      }

      setMessages(prev => [...prev, assistantMsg])
      if (data.outcome && data.outcome !== 'in_progress') {
        setOutcome(data.outcome)
      }
      speakText(data.reply)
    } catch {
      setIsThinking(false)
      const fallbackMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        text: 'At ARTH Marketing Media, we help businesses attract customers both online and offline. Would you like to schedule a complimentary strategy audit with our team?',
        time: nowTime()
      }
      setMessages(prev => [...prev, fallbackMsg])
      speakText(fallbackMsg.text)
    }
  }

  const endCall = async () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
    }
    setCallState('ended')

    // Persist to backend
    try {
      await fetch('/api/web-call/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          duration: formatTime(duration),
          transcript: messages.map(m => ({
            role: m.role === 'assistant' ? activeAgent.name : 'Client',
            text: m.text
          })),
          contactName: `Web Caller (${activeAgent.name} Live Test)`,
          phone: '+91 98099 87999',
          outcome: outcome === 'in_progress' ? 'interested' : outcome,
          summary: `Web voice call ended at ${formatTime(duration)}. Spoke with ${activeAgent.name} from ARTH Marketing Media.`,
          agentName: activeAgent.name
        })
      })
      if (onCallSaved) onCallSaved()
    } catch {
      // ignore
    }
  }

  const restartCall = () => {
    startSessionWithAgent(activeAgent)
  }

  // Dynamic quick prompts based on active agent
  const getQuickPrompts = () => {
    if (activeAgent.language === 'te-IN') {
      return [
        'మీ 4-స్టెప్ ప్రాసెస్ ఎలా పనిచేస్తుంది?',
        'మా బిజినెస్ కి ఫ్రీ మార్కెటింగ్ ఆడిట్ కావాలి',
        'Fit Secrets & Samadhai Tech కేస్ స్టడీస్ చెప్పండి',
        'ఆఫ్‌లైన్ స్టోర్ ప్రమోషన్స్ ఎలా చేస్తారు?',
        'రేపు సాయంత్రం 6 గంటలకు కాల్ చేయండి'
      ]
    }
    if (activeAgent.id === 'a-kabir') {
      return [
        'What is included in your reels and video shoots?',
        'Tell me about your product shoot for Fit Secrets',
        'Can you write video scripts and ad creatives?',
        'Send over your creative video portfolio',
        'Let us book a video concept brainstorm'
      ]
    }
    if (activeAgent.id === 'a-dev') {
      return [
        'Tell me about the websites for Quantumrise & Samadhai',
        'We need a high-converting business website & SEO',
        'Can you integrate automated WhatsApp flows?',
        'Can you run a speed and SEO audit of our website?',
        'Schedule a technical scoping call'
      ]
    }
    if (activeAgent.id === 'a-rhea') {
      return [
        'How do I claim a complimentary marketing audit?',
        'Where do most companies leak customer acquisition?',
        'How can we reach ARTH on WhatsApp (+91 9809987999)?',
        'What is your 4-step framework?',
        'Schedule a strategy call with the team'
      ]
    }
    // Default (Aditi - Growth & Paid Ads)
    return [
      'How does your 4-step framework work?',
      'We want to scale our Meta & Google Ads for leads',
      'Tell me about your work with Fit Secrets',
      'Book a complimentary marketing audit',
      'Call me back tomorrow evening'
    ]
  }

  const quickPrompts = getQuickPrompts()

  return (
    <div className="webcall-overlay" role="dialog" aria-modal="true">
      <div className="webcall-container">
        {/* Call Header */}
        <header className="webcall-header">
          <div className="webcall-identity">
            <div className={`webcall-avatar ${isSpeaking ? 'speaking' : ''}`}>
              <span>{activeAgent.name === 'Priya' ? 'ప' : activeAgent.name[0]}</span>
              {isSpeaking && <div className="avatar-pulse-ring" />}
            </div>
            <div>
              <div className="webcall-title-row">
                <h3>{activeAgent.name} · ARTH Agent</h3>
                <span className="telugu-badge">
                  {activeAgent.language} · {activeAgent.voice}
                </span>
              </div>
              <p className="webcall-status-row">
                {callState === 'connecting' && <span className="status-dot connecting">Connecting...</span>}
                {callState === 'active' && (
                  <span className="status-dot live">
                    <span className="live-blink" /> Live Call · {formatTime(duration)}
                  </span>
                )}
                {callState === 'ended' && <span className="status-dot ended">Call Ended</span>}
              </p>
            </div>
          </div>

          <div className="webcall-top-actions">
            {/* Agent Switcher Menu */}
            <div style={{ position: 'relative' }}>
              <button
                className="webcall-icon-btn agent-switch-trigger"
                onClick={() => setAgentMenuOpen(!agentMenuOpen)}
                title="Switch ARTH Agent"
                aria-label="Switch Agent"
                style={{ width: 'auto', padding: '0 10px', fontSize: '11px', fontWeight: 700, gap: '4px', display: 'flex' }}
              >
                <span>{activeAgent.name}</span>
                <CaretDown size={12} weight="bold" />
              </button>
              {agentMenuOpen && (
                <div className="agent-dropdown-menu">
                  <div className="dropdown-label">Select ARTH Predefined Agent</div>
                  {agents.map(a => (
                    <button
                      key={a.id}
                      className={`dropdown-item ${a.id === activeAgentId ? 'active' : ''}`}
                      onClick={() => {
                        setActiveAgentId(a.id)
                        setAgentMenuOpen(false)
                        startSessionWithAgent(a)
                        notify(`Switched to ${a.name} (${a.language})`)
                      }}
                    >
                      <span className="agent-mini-tile">{a.name === 'Priya' ? 'ప' : a.name[0]}</span>
                      <div>
                        <strong>{a.name}</strong>
                        <small>{a.language} · {a.voice}</small>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {callState === 'active' && (
              <>
                <button
                  className={`webcall-icon-btn ${!speakerEnabled ? 'off' : ''}`}
                  onClick={toggleSpeaker}
                  title={speakerEnabled ? 'Mute speaker' : 'Unmute speaker'}
                  aria-label="Toggle speaker"
                >
                  {speakerEnabled ? <SpeakerHigh size={18} weight="bold" /> : <SpeakerSlash size={18} weight="bold" />}
                </button>
                <button
                  className={`webcall-icon-btn ${!micEnabled ? 'off' : ''}`}
                  onClick={toggleMic}
                  title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                  aria-label="Toggle microphone"
                >
                  {micEnabled ? <Microphone size={18} weight="bold" /> : <MicrophoneSlash size={18} weight="bold" />}
                </button>
              </>
            )}
            <button className="webcall-close-btn" onClick={close} title="Close window" aria-label="Close">
              <X size={18} weight="bold" />
            </button>
          </div>
        </header>

        {/* Company Badge Strip */}
        <div className="webcall-company-strip">
          <div className="company-info">
            <span className="brand-dot" />
            <strong>ARTH Marketing Media</strong>
            <span className="sep">•</span>
            <span>Marketing. Content. Technology.</span>
          </div>
          <a
            href="https://arth-mauve.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="company-link"
          >
            arth-mauve.vercel.app
          </a>
        </div>

        {/* Live Audio Visualizer Banner */}
        {callState === 'active' && (
          <div className="webcall-spectrum-bar">
            <div className="spectrum-label">
              {isSpeaking ? (
                <span className="speaking-indicator">{activeAgent.name} is speaking...</span>
              ) : isThinking ? (
                <span className="thinking-indicator">{activeAgent.name} is thinking...</span>
              ) : isListening ? (
                <span className="listening-indicator">Listening to your voice...</span>
              ) : (
                <span>Ready to talk</span>
              )}
            </div>
            <div className="live-spectrum">
              {[4, 12, 8, 22, 14, 18, 9, 24, 16, 11, 20, 7, 15, 23, 10, 19, 13, 8, 21, 6].map((h, i) => (
                <span
                  key={i}
                  className={`spectrum-bar ${(isSpeaking || isListening) ? 'active' : ''}`}
                  style={{
                    height: (isSpeaking || isListening) ? `${h}px` : '4px',
                    animationDelay: `${(i % 5) * 0.12}s`
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Main Body: Live Transcription Feed */}
        <div className="webcall-transcription-area">
          {callState === 'connecting' && (
            <div className="connecting-state">
              <div className="connecting-spinner" />
              <h4>Connecting to {activeAgent.name}...</h4>
              <p>Establishing bidirectional AI voice channel for ARTH Marketing Media.</p>
            </div>
          )}

          {callState === 'active' && (
            <div className="transcription-stream">
              {messages.map(m => (
                <div key={m.id} className={`transcription-bubble ${m.role}`}>
                  <div className="bubble-meta">
                    <strong>{m.role === 'assistant' ? `${activeAgent.name} (ARTH AI)` : 'You'}</strong>
                    <small>{m.time}</small>
                  </div>
                  <p className="bubble-text">{m.text}</p>
                </div>
              ))}

              {interimText && (
                <div className="transcription-bubble user interim">
                  <div className="bubble-meta">
                    <strong>You</strong>
                    <small>Speaking...</small>
                  </div>
                  <p className="bubble-text">{interimText}</p>
                </div>
              )}

              {isThinking && (
                <div className="transcription-bubble assistant thinking">
                  <div className="bubble-meta">
                    <strong>{activeAgent.name} (ARTH AI)</strong>
                  </div>
                  <div className="typing-dots">
                    <span /><span /><span />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {callState === 'ended' && (
            <div className="call-ended-summary">
              <div className="ended-icon-wrap">
                <CheckCircle size={36} weight="fill" />
              </div>
              <h3>Call with {activeAgent.name} Completed</h3>
              <p className="summary-desc">
                Your live voice interaction was recorded and transcribed for ARTH Marketing Media.
              </p>

              <div className="summary-metrics-grid">
                <div>
                  <span>Duration</span>
                  <strong>{formatTime(duration)}</strong>
                </div>
                <div>
                  <span>Transcripts</span>
                  <strong>{messages.length} lines</strong>
                </div>
                <div>
                  <span>Outcome</span>
                  <strong className="outcome-pill hot">
                    {outcome === 'callback_requested' ? 'Callback Scheduled' : outcome === 'not_interested' ? 'Not Interested' : 'Strategy Audit Interested'}
                  </strong>
                </div>
              </div>

              <div className="ended-actions">
                <button className="secondary-button" onClick={restartCall}>
                  <ArrowCounterClockwise size={16} /> Call Again
                </button>
                <button className="primary-button" onClick={close}>
                  View in Call Logs
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Prompts Suggestions */}
        {callState === 'active' && (
          <div className="webcall-quick-prompts">
            <span className="prompts-label"><Sparkle size={13} weight="fill" /> Quick prompt:</span>
            <div className="prompts-slider">
              {quickPrompts.map((p, idx) => (
                <button key={idx} className="prompt-pill" onClick={() => void handleUserSend(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Call Footer / Action Bar */}
        {callState === 'active' && (
          <footer className="webcall-footer">
            <form
              className="webcall-input-form"
              onSubmit={e => {
                e.preventDefault()
                void handleUserSend(inputText)
              }}
            >
              <input
                type="text"
                placeholder={micEnabled ? `Speak into mic, or type in ${activeAgent.language === 'te-IN' ? 'Telugu / English' : 'English'}...` : 'Type your message...'}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
              />
              <button
                type="submit"
                className="send-btn"
                disabled={!inputText.trim()}
                title="Send message"
                aria-label="Send message"
              >
                <PaperPlaneRight size={17} weight="bold" />
              </button>
            </form>

            <button
              className="end-call-btn"
              onClick={endCall}
              title="End Call"
              aria-label="End Call"
            >
              <PhoneDisconnect size={20} weight="fill" />
              <span>End Call</span>
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}
