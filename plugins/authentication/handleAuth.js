'use strict';
//required for authentication
var passwordHash = require('password-hash');
var passport = require ('passport');
var passportConfig = require('./passport-config');
passportConfig.enable(passport);
//----------------------
var rp = require('request-promise');
var config = require('../../configs/general');
var reactorConfig = require('../../configs/reactor');
var httpOptions = {
  host: config.sparqlEndpoint[0].host,
  port: config.sparqlEndpoint[0].port,
  path: config.sparqlEndpoint[0].path
};
var outputFormat = 'application/sparql-results+json';
module.exports = function handleAuthentication(server) {
    server.use(passport.initialize());
    server.use(passport.session());
    server.get('/login', function(req, res) {
        if(!req.isAuthenticated()){
            res.render('login', {user: req.user });
        }else{
            return res.redirect('/');
        }
     });
    server.post('/login', function(req, res, next) {
        let redirectTo = req.session.redirectTo ? req.session.redirectTo : '/';
        delete req.session.redirectTo;
        passport.authenticate('local', function(err, user, info) {
            if (err) { return next(err); }
            if (!user) {
                console.log('auth failed! ' + info.message);
                res.render('login', {data: req.body, errorMsg: 'Authentication failed... ' + info.message});
            }else{
                req.logIn(user, function(err2) {
                    if (err2) { return next(err2); }
                    // console.log('auth is OK!');
                    return res.redirect(redirectTo);
                });
            }
        })(req, res, next);
    });
    server.get('/logout', function(req, res) {
        req.logout();
        res.redirect('/');
    });
    server.get('/confirmation', function(req, res) {
        if(!req.isAuthenticated()){
            res.render('confirmation', {needsConfirmation: reactorConfig.enableUserConfirmation});
        }else{
            return res.redirect('/');
        }
     });
    server.get('/register', function(req, res) {
        if(!req.isAuthenticated()){
            res.render('register');
        }else{
            return res.redirect('/');
        }
     });
     server.post('/register', function(req, res, next) {
         let error= '';
         if(req.body.password !== req.body.cpassword){
             error = 'Error! password mismatch...';
         }else{
             for (let prop in req.body) {
                 if(!req.body[prop]){
                     error = error + ' missing value for "' + prop +'"';
                 }
             }
         }
         if(error){
             console.log(error);
             res.render('register', {data: req.body, errorMsg: 'Error... '+error});
         }else{
             //successfull
             //first check if user already exists
             /*jshint multistr: true */
             var query = '\
             PREFIX foaf: <http://xmlns.com/foaf/0.1/> \
             SELECT count(?s) AS ?exists FROM <'+ reactorConfig.authGraphName[0] +'> WHERE { \
               { \
                   ?s a foaf:Person . \
                   ?s foaf:accountName "'+ req.body.username +'" .\
               } \
             } \
             ';
             var rpPath = httpOptions.path+'?query='+ encodeURIComponent(query)+ '&format='+encodeURIComponent(outputFormat);
             //send request
             rp.get({uri: 'http://'+httpOptions.host+':'+httpOptions.port+ rpPath}).then(function(resq){
                 var parsed = JSON.parse(resq);
                 if(parsed.results.bindings.length){
                     if(parsed.results.bindings[0].exists.value ==='0'){
                         //register as new user
                         console.log('start registration');
                         var resourceURI = reactorConfig.dynamicResourceDomain + '/user/' + Math.round(+new Date() / 1000);
                         var tmpE= [];
                         var isActive = reactorConfig.enableUserConfirmation;
                         /*jshint multistr: true */
                         query = '\
                         PREFIX ldReactor: <https://github.com/ali1k/ld-reactor/blob/master/vocabulary/index.ttl#> \
                         PREFIX foaf: <http://xmlns.com/foaf/0.1/> \
                         INSERT DATA INTO <'+ reactorConfig.authGraphName[0] +'> { \
                         <'+ resourceURI + '> a foaf:Person; foaf:firstName "'+req.body.firstname+'"; foaf:lastName "'+req.body.lastname+'"; foaf:organization "'+req.body.organization+'"; foaf:mbox <'+req.body.email+'>; foaf:accountName "'+req.body.username+'"; ldReactor:password "'+passwordHash.generate(req.body.password)+'"; ldReactor:isActive "'+isActive+'"^^xsd:Integer; ldReactor:isSuperUser "0"^^xsd:Integer; ldReactor:editorOfGraph <http://exampleGraph.org>; ldReactor:editorOfResource <http://exampleResource.org>; ldReactor:editorOfProperty <http://exampleProperty.org>. }';
                        //  console.log(query);
                         rpPath = httpOptions.path+'?query='+ encodeURIComponent(query)+ '&format='+encodeURIComponent(outputFormat);

                         rp.get({uri: 'http://'+httpOptions.host+':'+httpOptions.port+ rpPath}).then(function(){
                             console.log('User is created!');
                             return res.redirect('/confirmation');
                         }).catch(function (err2) {
                             console.log(err2);
                         });
                     }else{
                         res.render('register', {data: req.body, errorMsg: 'Error... User already exists!'});
                         console.log('User already exists!');
                     }

                 }else{
                     res.render('register', {data: req.body, errorMsg: 'Error... Unknown Error!'});
                 }
             }).catch(function (errq) {
                 console.log(errq);
             });
         }
     });
};
