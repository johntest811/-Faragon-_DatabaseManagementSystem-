// import React, {useState} from 'react';
// import {useRouter} from 'next/navigation';
// import { supabase } from '../Clients/Supabase/SupabaseClients';


export default function Login() {
//Put the Login here if needed





  return (
    
    // Logo Icon forr the Login Form
    <div className='min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4'>
     <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-center mb-8">
      {/* <Logo size="large" /> */}
     </div>


     <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">Login</h1>
     
      {/* {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded">
            <div className="flex">
              <div className="py-1">
                <svg className="h-6 w-6 text-red-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="font-medium">{error}</p>
              </div>
            </div>
          </div>
        )} */}


        {/* Start of the form login */}
       <form>
        {/* Username */}
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-800 mb-1">Username</label>
          <input
          type="text"
          id="username"
          className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-black"
          placeholder="Enter your username"
          // value={username}
          // onChange={(e) => setUsername (e.target.value)}
          required
          autoComplete="username"
          />
          </div>

          {/* Password */}
          <div>

            <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-1">Password</label>
            <input
            type="password"
            id="password"
            className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-black"
            placeholder="Enter your password"
            // value={password}
            // onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            />
          </div>

          <div>
            <button
            type="submit"
            // disabled={isLoading}
            // className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
>

              {/* {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </>
              ) : 'Sign in'} */}

           </button>
          </div>

       </form>

       <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Authorized access only</span>
            </div>
          </div>
        </div>

      <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Use your assigned username and password to access the admin panel
          </p>
        </div>


       </div>
    <p className="mt-8 text-center text-sm text-gray-600">
        &copy; {new Date().getFullYear()} GrandLink Glass and Aluminium. All rights reserved.
      </p>

   </div>
  );
  
}
