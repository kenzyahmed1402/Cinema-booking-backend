import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Armchair, ArrowUp, CircleAlert, RotateCcw, Sparkles } from "lucide-react";
import { api, ApiError, errorMessage } from "../api";
import { useAuth } from "../auth";
import { useMediaQuery } from "../hooks";
import type { Booking, ChatMessage, Proposal, ProposalCard } from "../types";
import { CinemaHall } from "../components/CinemaHall";
import { MessageText } from "../components/MessageText";
import { ProposalTicket, type CardState } from "../components/ProposalTicket";

const SUGGESTIONS = ["Sci-fi tonight for two", "Something funny tomorrow", "Downtown this weekend", "Cancel my booking"];

// Messages added on this visit fade in; ones loaded from the server don't
type ShownMessage = ChatMessage & { isNew?: boolean };

const emptyHall = () => "free" as const;

// The assistant: a conversation, and the booking and cancellation cards it
// proposes. A card changes nothing until the customer presses Confirm,
// which needs an account.
export const Chat = ({ initial }: { initial?: string }) => {
  const { user, requireUser } = useAuth();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const stream = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  // Load the conversation, and again after logging in: a visitor's chat
  // moves to their account then
  const owner = user === undefined ? null : (user?._id ?? "visitor");
  useEffect(() => {
    if (owner === null) return;
    api<{ messages: ChatMessage[] }>("GET", "/agent/chat")
      .then((data) => setMessages(data.messages))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoaded(true));
  }, [owner]);

  const cards = useMemo(() => messages.flatMap((message) => message.cards ?? []), [messages]);
  const panelCard = cards.find((card) => card.proposal === selected) ?? cards[cards.length - 1];

  // Ask the server where each card stands: open, confirmed, or gone
  useEffect(() => {
    for (const card of cards) {
      if (cardStates[card.proposal]) continue;
      setCardStates((all) => ({ ...all, [card.proposal]: { status: "loading" } }));
      api<{ proposal: Proposal }>("GET", `/agent/proposals/${card.proposal}`)
        .then(({ proposal }) =>
          setCardStates((all) => ({ ...all, [card.proposal]: { status: proposal.status === "confirmed" ? "confirmed" : "open" } }))
        )
        .catch(() => setCardStates((all) => ({ ...all, [card.proposal]: { status: "expired" } })));
    }
  }, [cards, cardStates]);

  const updateCard = (id: string, change: Partial<CardState>) =>
    setCardStates((all) => ({ ...all, [id]: { ...all[id], ...change } }));

  const confirm = async (card: ProposalCard) => {
    const signedIn = await requireUser(card.type === "booking" ? "Log in to hold your seats" : "Log in to cancel your booking");
    if (!signedIn) return;
    updateCard(card.proposal, { busy: true, error: "" });
    try {
      const { booking } = await api<{ proposal: Proposal; booking: Booking }>("POST", `/agent/proposals/${card.proposal}/confirm`);
      updateCard(card.proposal, { status: "confirmed", booking, busy: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) updateCard(card.proposal, { status: "expired", busy: false });
      else updateCard(card.proposal, { error: errorMessage(err), busy: false });
    }
  };

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message) return;
    setError("");
    setSending(true);
    setMessages((all) => [...all, { role: "user", text: message, isNew: true }]);
    try {
      const { reply, cards: newCards } = await api<{ reply: string; cards: ProposalCard[] }>("POST", "/agent/chat", { message });
      setMessages((all) => [...all, { role: "assistant", text: reply, cards: newCards, isNew: true }]);
      if (newCards.length) setSelected(newCards[newCards.length - 1].proposal);
    } catch (err) {
      // The server keeps no failed turn: take the message back into the box
      setMessages((all) => all.slice(0, -1));
      setDraft(message);
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }, []);

  // A question typed on the home page is asked once, then dropped from the
  // address so a reload doesn't ask it again
  useEffect(() => {
    if (!loaded || !initial || sentInitial.current) return;
    sentInitial.current = true;
    window.history.replaceState(null, "", "#/chat");
    send(initial);
  }, [loaded, initial, send]);

  // Keep the conversation moving: a new reply scrolls to its first line, so
  // a long reply with cards is read from the top; anything else to the end
  useEffect(() => {
    const box = stream.current;
    if (!box) return;
    const shown = box.querySelectorAll<HTMLElement>(".msg");
    const last = shown[shown.length - 1];
    const reply = !sending && last?.classList.contains("assistant") && last.classList.contains("new");
    box.scrollTo({ top: reply && last ? last.offsetTop - 16 : box.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    send(draft);
    setDraft("");
  };

  // Enter sends; Shift+Enter starts a new line
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) submit(event);
  };

  const newChat = async () => {
    try {
      await api("DELETE", "/agent/chat");
      setMessages([]);
      setCardStates({});
      setSelected(null);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const stateOf = (card: ProposalCard): CardState => cardStates[card.proposal] ?? { status: "loading" };

  return (
    <div className="chat-page">
      <section className="chat card" aria-label="Conversation with the assistant">
        <header className="chat-head">
          <h1>
            <Sparkles size={20} aria-hidden="true" /> Assistant
          </h1>
          {messages.length > 0 && (
            <button type="button" className="button ghost small" onClick={newChat} disabled={sending}>
              <RotateCcw size={15} aria-hidden="true" /> New chat
            </button>
          )}
        </header>

        <div className="chat-stream" ref={stream} role="log" aria-live="polite">
          {loaded && messages.length === 0 && !sending && (
            <div className="chat-empty">
              <span className="step-icon" aria-hidden="true">
                <Sparkles size={22} />
              </span>
              <h2>What would you like to watch?</h2>
              <ul className="chat-hints muted">
                <li>Mood, day and number of seats</li>
                <li>Or a booking to cancel</li>
              </ul>
              <div className="chips">
                {SUGGESTIONS.map((text) => (
                  <button key={text} type="button" className="chip" onClick={() => send(text)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, i) => (
            <div key={i} className={`msg ${message.role}${message.isNew ? " new" : ""}`}>
              {message.role === "assistant" && (
                <span className="msg-avatar" aria-hidden="true">
                  <Sparkles size={15} />
                </span>
              )}
              <div className="msg-content">
                <span className="sr-only">{message.role === "assistant" ? "CineMate:" : "You:"}</span>
                {message.text && (
                  <div className="msg-text">
                    <MessageText text={message.text} />
                  </div>
                )}
                {message.cards?.map((card) => (
                  <ProposalTicket
                    key={card.proposal}
                    card={card}
                    state={stateOf(card)}
                    onConfirm={confirm}
                    variant={wide ? "compact" : "full"}
                    selected={wide && panelCard?.proposal === card.proposal}
                    onSelect={() => setSelected(card.proposal)}
                  />
                ))}
              </div>
            </div>
          ))}

          {sending && (
            <div className="msg assistant thinking">
              <span className="msg-avatar" aria-hidden="true">
                <Sparkles size={15} />
              </span>
              <div className="dots" aria-label="CineMate is thinking">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="chat-error" role="alert">
            <CircleAlert size={15} aria-hidden="true" /> {error}
          </p>
        )}

        <form className="composer" onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask for a movie, a time, seats…"
            aria-label="Message the assistant"
            maxLength={1000}
            rows={1}
          />
          <button type="submit" className="send" disabled={sending || !draft.trim()} aria-label="Send">
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        </form>
      </section>

      {wide && (
        <aside className="chat-panel" aria-label="Your booking">
          <h2 className="panel-title">
            <Armchair size={18} aria-hidden="true" /> Your booking
          </h2>
          {panelCard ? (
            <ProposalTicket key={panelCard.proposal} card={panelCard} state={stateOf(panelCard)} onConfirm={confirm} variant="full" />
          ) : (
            <div className="panel-empty card">
              <CinemaHall className="ticket-hall" rows={8} seatsPerRow={12} stateOf={emptyHall} label="An empty cinema hall" />
              <p className="muted">Your seats show up here</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
};
