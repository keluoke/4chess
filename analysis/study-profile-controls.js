import { accountKey, normalizeAccount } from './study-store.js?v=20261123-fit-report-zh';
import { t } from './i18n.js?v=20261123-fit-report-zh';

export class StudyProfileControls {
  busy = false;
  dismissed = new Set();

  constructor(app) {
    this.app = app;
    this.bank = app.mistakeBank;
    this.select = document.getElementById('studio-profile-select');
    this.picker = document.getElementById('studio-profile-picker');
    this.name = document.getElementById('studio-profile-name');
    this.newButton = document.getElementById('btn-studio-new-profile');
    this.editor = document.getElementById('study-profile-dialog');
    this.editorName = document.getElementById('study-profile-name');
    this.editorTitle = document.getElementById('study-profile-title');
    this.editorHint = document.getElementById('study-profile-hint');
    this.editorSave = document.getElementById('study-profile-save');
    this.editorKeep = document.getElementById('study-profile-keep');
    this.newButton.onclick = () => this.change(() => this.createProfile());
    this.editorKeep.onclick = () => this.editor.close('keep');
    document.getElementById('study-profile-cancel').onclick = () => this.editor.close();
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

  async change(operation) {
    if (this.busy || this.app.checkup.busy || !this.bank.allowed()) return;
    this.busy = true;
    this.render();
    try {
      await operation();
    } catch {
      this.app.showToast(t('checkupAccountError'));
    } finally {
      this.busy = false;
      this.render();
    }
  }

  async askForProfile({ account, split, move, profile, reportId }) {
    if (this.editor.open) return null;
    const name = this.bank.profileLabel(profile);
    const title = move ? 'studyMoveProfile' : split ? 'studySplitTitle' : 'bankNewProfile';
    const hint = move ? 'studyMoveHint' : split ? (reportId ? 'studySplitReportHint' : 'studySplitHint') : 'studyNewHint';
    this.editorTitle.textContent = t(title);
    this.editorHint.textContent = t(hint, { account: account && this.app.checkup.accountLabel(account), profile: name });
    this.editorName.value = account?.username || '';
    this.editorSave.textContent = t(account && !move ? 'studyCreateAndLink' : 'bankNewProfile');
    this.editorKeep.hidden = !split;
    this.editor.returnValue = '';
    this.editor.showModal();
    this.editorName.select();
    return new Promise(resolve => this.editor.addEventListener('close', () => {
      resolve(this.editor.returnValue);
    }, { once: true }));
  }

  async createProfile({ account, move = false, split = false, reportId } = {}) {
    const profile = this.bank.activeProfile;
    if (!profile || !this.bank.allowed()) return false;
    const epoch = this.app.gameEpoch;
    const checkupOpen = this.app.checkup.dialog?.open;
    const result = await this.askForProfile({ account, move, split, profile, reportId });
    if (!this.bank.allowed() || this.bank.activeProfile?.id !== profile.id || this.app.gameEpoch !== epoch ||
      (checkupOpen && !this.app.checkup.dialog.open)) return false;
    if (result === 'keep') {
      await this.bank.updateProfileAccount(profile.id, account.platform, account.username);
      return true;
    }
    if (result !== 'create') return false;
    const displayName = this.editorName.value.trim();
    if (!displayName) return false;
    const saved = await this.bank.store.saveProfile({
      displayName, account, moveFrom: move ? profile.id : undefined,
      transferCheckup: split && reportId ? { id: reportId, profileId: profile.id } : undefined
    });
    if (!this.bank.allowed() || this.bank.activeProfile?.id !== profile.id || this.app.gameEpoch !== epoch) return false;
    await this.bank.selectProfile(saved.id);
    if (account) this.app.checkupReminders?.offerAfterLink(saved);
    return true;
  }

  async linkAccount(account, { reportId } = {}) {
    const profile = this.bank.activeProfile;
    if (!profile || !this.bank.allowed()) return false;
    const key = accountKey(account);
    if (profile.accounts.some(item => accountKey(item) === key)) return false;
    if (profile.accounts.some(item => item.platform === account.platform)) {
      return this.createProfile({ account, split: true, reportId });
    }
    await this.bank.updateProfileAccount(profile.id, account.platform, account.username);
    return true;
  }

  render() {
    const { activeProfile, profiles } = this.bank;
    const allowed = this.bank.allowed() && !!activeProfile;
    this.picker.hidden = !allowed;
    if (!allowed && this.editor.open) this.editor.close();
    this.select.disabled = this.newButton.disabled = this.busy;
    if (allowed) this.bank.renderProfilePicker(this.select, this.name);

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
          return this.change(async () => {
            if (await this.linkAccount(account)) {
              this.app.showToast(t('checkupAccountSaved', { account: `${platform} · ${account.username}` }));
            }
          });
        };
      }
      this.players.append(button);
    }
    this.guide.hidden = false;
  }
}
