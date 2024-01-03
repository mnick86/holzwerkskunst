import {Component} from '@angular/core';

export function name() {
  const str = 'TWF0dG'.concat('hpYXMgTmljaw==');
  return atob(str);
}
export function street() {
  const str = 'TGluZGVuc3RyYXNzZSA'.concat('3YQ==');
  return atob(str);
}
export function plz() {
  const str = 'ODQw'.concat('MzAgRXJnb2xkaW5n');
  return atob(str);
}
export function mobile() {
  const str = 'MDE3MSA2'.concat('NDQ3NTQ4');
  return atob(str);
}
export function email() {
  const str = 'bW5pY2s4'.concat('NkBnbWF').concat('pbC5jb20=');
  return atob(str);
}

@Component({
  selector: 'app-personal-infos',
  templateUrl: './personal-infos.component.html',
  styleUrl: './personal-infos.component.scss',
})
export class PersonalInfosComponent {
  name = name();
  street = street();
  plz = plz();
  mobile = mobile();
  email = email();
}
