const MODEL_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }]
};

const AVAILABILITY = new Set(['unavailable', 'downloadable', 'downloading', 'available']);

export class BuiltInAi {
  state = 'idle';
  progress = null;
  revision = 0;

  constructor(onChange) {
    this.onChange = onChange;
    this.chromeBrand = globalThis.navigator?.userAgentData?.brands?.some(({ brand }) => brand === 'Google Chrome') ?? false;
  }

  setState(state) {
    this.state = state;
    this.onChange();
  }

  async probe({ recheck = false } = {}) {
    if (this.state !== 'idle' &&
        !(recheck && ['unsupported', 'unavailable', 'downloadable', 'downloading'].includes(this.state))) return;
    const api = globalThis.LanguageModel;
    if (typeof api?.availability !== 'function' || typeof api?.create !== 'function') {
      this.setState('unsupported');
      return;
    }
    const revision = ++this.revision;
    this.setState('checking');
    try {
      const status = await api.availability(MODEL_OPTIONS);
      if (revision === this.revision) this.setState(AVAILABILITY.has(status) ? status : 'unavailable');
    } catch {
      if (revision === this.revision) this.setState('unavailable');
    }
  }

  async create({ gesture = false } = {}) {
    if (this.state !== 'available' && !(gesture && ['downloadable', 'downloading', 'failed'].includes(this.state))) return;
    const revision = ++this.revision;
    const controller = this.creation = new AbortController();
    this.progress = null;
    this.setState('starting');
    try {
      // There is no await before create. A download may require transient user activation.
      const session = await globalThis.LanguageModel.create({
        ...MODEL_OPTIONS,
        signal: controller.signal,
        initialPrompts: [{
          role: 'system',
          content: 'Choose the lead and supporting detail for a short chess review. Use only the provided facts and allowed sentence IDs. Choose the concrete reply if it explains the move; otherwise highlight the comparison or measured loss. Return only the requested JSON.'
        }],
        monitor: monitor => monitor.addEventListener('downloadprogress', event => {
          if (revision !== this.revision || this.state !== 'starting' || !Number.isFinite(event.loaded)) return;
          this.progress = Math.round(Math.max(0, Math.min(1, event.loaded)) * 100);
          this.onChange();
        })
      });
      if (revision !== this.revision) {
        session.destroy();
        return;
      }
      if (typeof session.clone !== 'function') {
        session.destroy();
        this.setState('unsupported');
        return;
      }
      this.session = session;
      this.setState('ready');
    } catch {
      if (revision === this.revision) this.setState('failed');
    }
  }

  async choose(input, responseConstraint, signal) {
    signal.throwIfAborted();
    const clone = await this.session.clone({ signal });
    try {
      signal.throwIfAborted();
      return JSON.parse(await clone.prompt(JSON.stringify(input), { signal, responseConstraint }));
    } finally {
      clone.destroy();
    }
  }

  dispose() {
    this.revision++;
    if (this.session) this.session.destroy();
    else this.creation?.abort();
    this.session = this.creation = null;
    this.progress = null;
    this.setState('idle');
  }
}
