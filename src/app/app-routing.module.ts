import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StartComponent } from './start/start.component';
import { ImpressumComponent } from './impressum/impressum.component';

const routes: Routes = [
  {
    path: 'home',
    component: StartComponent
  },
  {
    path: 'impressum',
    component: ImpressumComponent
  },
  {
    path: '**',
    component: StartComponent
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
