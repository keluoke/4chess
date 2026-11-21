import { accountKey, normalizeAccount } from './study-store.js?v=20261121-v127';
import { t } from './i18n.js?v=20261121-v127';

export class StudyProfileControls {
  busy = false;
  dismissed = new Set();

  constructor(app) {
    this.app = app;
    this.bank = app.mistakeBank;
    this.select = document.getElementById('studio-profile-select');
    this.guide = document.getElementById('study-link-guide');
    this.title = document.getElementById('study-link-title');
    this.players = document.getElementById('study-link-players');
    this.dismiss = document.getElementById('study-link-dismiss');
    this.select.onchange = () => this.chooseProfile(this.select.value);
    this.dismiss.onclick = () => {
      if (!this.dismissKey) return;
      this.dismissed.add(this.dismissKey);
      try { sessionStorage.setItem(this.dismissKey, '1'); } catch {}
      this.render();
    };
  }

  async chooseProfile(id) {
    if (this.busy || this.app.checkup.busy || !this.bank.allowed()) return;
    await this.change(() => this.bank.selectProfile(id));
  }

  async change(operation, linkedName = '') {
    if (this.busy || !this.bank.allowed()) return;
    this.busy = true;
    this.render();
    try {
      await operation();
      if (linkedName) this.app.showToast(t('checkupAccountSaved', { account: linkedName }));
    } catch {
      this.app.showToast(t('checkupAccountError'));
    } finally {
      this.busy = false;
      this.render();
    }
  }

  render() {
    const { activeProfile, profiles } = this.bank;
    const allowed = this.bank.allowed() && !!activeProfile;
    this.select.hidden = !allowed;
    this.select.disabled = this.busy;
    if (allowed) this.bank.renderProfileOptions(this.select);

    this.guide.hidden = true;
    this.dismissKey = null;
    const game = this.app.checkupGame;
    if (!allowed || !game || this.app.moves?.isPartial) return;
    const candidates = [game.white, game.black].map((name, index) => ({
      account: normalizeAccount(game.platform, name), side: index ? 'blackPlayer' : 'whitePlayer'
    })).filter(({ account }) => account);
    const matches = (profile, account) => profile.accounts?.some(item => accountKey(item) === accountKey(account));
    if (!candidates.length || candidates.some(({ account }) => matches(activeProfile, account))) return;
    const key = `diverge-link:${activeProfile.id}:${game.platform}:${game.gameRef}`;
    if (this.dismissed.has(key)) return;
    try { if (sessionStorage.getItem(key)) return; } catch {}
    this.dismissKey = key;

    const platform = game.platform === 'lichess' ? 'Lichess' : 'Chess.com';
    this.title.textContent = t('studyLinkTitle', { platform, profile: this.bank.profileLabel(activeProfile) });
    this.players.replaceChildren();
    for (const { account, side } of candidates) {
      const owners = profiles.filter(profile => matches(profile, account));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-header';
      button.disabled = this.busy;
      if (owners.length === 1) {
        button.textContent = t('studyLinkSwitch', {
          player: account.username, profile: this.bank.profileLabel(owners[0])
        });
        button.onclick = () => this.chooseProfile(owners[0].id);
      } else if (owners.length > 1) {
        button.textContent = t('studyLinkChooseProfile', { player: account.username });
        button.onclick = () => this.select.focus();
      } else {
        button.textContent = t('studyLinkPlayer', { side: t(side), player: account.username });
        button.onclick = () => {
          if (this.app.checkupGame !== game || this.bank.activeProfile?.id !== activeProfile.id) return;
          return this.change(() => this.bank.updateProfileAccount(activeProfile.id, game.platform, account.username),
            `${platform} · ${account.username}`);
        };
      }
      this.players.append(button);
    }
    this.guide.hidden = false;
  }
}
