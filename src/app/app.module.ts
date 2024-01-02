import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ButtonModule } from 'primeng/button';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MenubarModule } from 'primeng/menubar';
import { StartComponent } from './start/start.component';
import { PreviewComponent } from './preview/preview.component';
import { CardModule } from 'primeng/card';
import { ImageModule } from 'primeng/image';
import { HttpClientModule } from '@angular/common/http';
import { TagModule } from 'primeng/tag';
import { ImpressumComponent } from './impressum/impressum.component';


@NgModule({
  declarations: [
    AppComponent,
    StartComponent,
    PreviewComponent,
    ImpressumComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    ButtonModule,
    CardModule,
    MenubarModule ,
    ImageModule,
    HttpClientModule,
    TagModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
